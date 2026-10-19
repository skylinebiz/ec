import frappe
import erpnext
from frappe import _
from erpnext.controllers.item_variant import create_variant
from itertools import product
from frappe.utils import flt, cint
from frappe.model.naming import make_autoname

@frappe.whitelist()
def get_attribute_values(attribute):

    attr = frappe.get_doc(
        "Item Attribute",
        attribute
    )

    return [
        {
            "attribute_value": d.attribute_value
        }
        for d in attr.item_attribute_values
    ]


@frappe.whitelist()
def get_attribute_values(attribute):

    if not attribute:
        return []

    return frappe.get_all(
        "Item Attribute Value",
        filters={
            "parent": attribute
        },
        fields=[
            "attribute_value",
            "abbr",
            "idx"
        ],
        order_by="idx asc"
    )


@frappe.whitelist()
def get_item_attributes():

    # frappe.get_all (unlike frappe.client.get_list) doesn't enforce
    # the calling user's permissions on Item Attribute - callers only
    # need rights on whichever doctype actually uses this (e.g. Image
    # Tagging Manager), not on Item Attribute itself.
    return frappe.get_all(
        "Item Attribute",
        fields=["name"],
        order_by="name asc"
    )

@frappe.whitelist()
def get_colour_values():

    if not frappe.db.exists("Item Attribute", "Colour"):
        return []

    attr = frappe.get_doc(
        "Item Attribute",
        "Colour"
    )

    return [
        {
            "colour": d.attribute_value,
            "abbr": d.abbr
        }
        for d in attr.item_attribute_values
    ]

@frappe.whitelist()
def generate_style_no():
    return make_autoname("STYN.#####")


@frappe.whitelist()
def create_style(item_group, style_no, rows):

    if isinstance(rows, str):
        rows = frappe.parse_json(rows)

    if not rows:
        frappe.throw(_("No rows found"))

    validate_duplicate_rows(rows)

    for price_list in ("MRP", "WSP"):
        ensure_price_list(price_list)

    for attribute in ("Colour", "Colour Code", "Size"):
        ensure_attribute(attribute)

    # Create Template

    template_name = style_no

    if not frappe.db.exists("Item", template_name):

        template = frappe.get_doc({
            "doctype": "Item",
            "item_code": template_name,
            "item_name": template_name,
            "item_group": item_group,
            "stock_uom": "Nos",
            "has_variants": 1,
            "is_stock_item": 1,
            "attributes": [
                {"attribute": "Colour"},
                {"attribute": "Colour Code"},
                {"attribute": "Size"},
            ]
        })

        template.insert(ignore_permissions=True)

    else:

        template = frappe.get_doc(
            "Item",
            template_name
        )

    # Create Variants

    created = []

    for row in rows:

        colour = str(row["colour_name"]).strip()
        colour_code = str(row["colour_code"]).strip()
        size = str(row["size"]).strip()

        # Create missing attribute values automatically

        ensure_attribute_value(
            "Colour",
            colour
        )

        ensure_attribute_value(
            "Size",
            size
        )

        ensure_attribute_value(
            "Colour Code",
            colour_code
        )

        attributes = {
            "Colour": colour,
            "Colour Code": colour_code,
            "Size": size,
        }

        variant = get_or_create_variant(
            template.name,
            attributes
        )

        update_price(
            variant,
            "MRP",
            flt(row["mrp"])
        )

        update_price(
            variant,
            "WSP",
            flt(row["wsp"])
        )

        created.append(variant)

    frappe.db.commit()

    return {
        "template": template.name,
        "variants": created
    }

def validate_duplicate_rows(rows):

    seen = set()

    for row in rows:

        key = (
            str(row["colour_name"]).strip(),
            str(row["colour_code"]).strip(),
            str(row["size"]).strip()
        )

        if key in seen:
            frappe.throw(
                _("Duplicate entry for Colour {0}, Colour Code {1}, Size {2}").format(*key)
            )

        seen.add(key)


def ensure_price_list(price_list):

    if frappe.db.exists("Price List", price_list):
        return

    frappe.get_doc({
        "doctype": "Price List",
        "price_list_name": price_list,
        "enabled": 1,
        "selling": 1,
        "currency": erpnext.get_default_currency()
    }).insert(ignore_permissions=True)


def get_or_create_variant(template, attributes):

    variants = frappe.get_all(
        "Item",
        filters={
            "variant_of": template
        },
        pluck="name"
    )

    for variant in variants:

        rows = frappe.get_all(
            "Item Variant Attribute",
            filters={
                "parent": variant
            },
            fields=[
                "attribute",
                "attribute_value"
            ]
        )

        existing = {
            d.attribute: d.attribute_value
            for d in rows
        }

        if existing == attributes:
            return variant

    variant = create_variant(
        template,
        attributes
    )

    if isinstance(variant, str):
        return variant
    
    variant.append(
        "barcodes",
        {
            "barcode": make_autoname("TT.#####")
        }
    )

    variant.save(ignore_permissions=True)

    return variant.name


def ensure_attribute(attribute):

    if frappe.db.exists("Item Attribute", attribute):
        return

    frappe.get_doc({
        "doctype": "Item Attribute",
        "attribute_name": attribute
    }).insert(ignore_permissions=True)


def ensure_attribute_value(attribute, value):

    value = str(value).strip()

    if frappe.db.exists(
        "Item Attribute Value",
        {
            "parent": attribute,
            "attribute_value": value
        }
    ):
        return

    attr = frappe.get_doc("Item Attribute", attribute)

    abbr = value

    existing_abbrs = {
        d.abbr
        for d in attr.item_attribute_values
    }

    if abbr in existing_abbrs:
        abbr = f"{value}_{len(existing_abbrs)+1}"

    attr.append(
        "item_attribute_values",
        {
            "attribute_value": value,
            "abbr": abbr
        }
    )

    attr.save(ignore_permissions=True)


def update_price(item_code, price_list, rate):

    if not rate:
        return

    price = frappe.db.get_value(
        "Item Price",
        {
            "item_code": item_code,
            "price_list": price_list
        }
    )

    if price:

        doc = frappe.get_doc(
            "Item Price",
            price
        )

        doc.price_list_rate = rate
        doc.save(ignore_permissions=True)

    else:

        frappe.get_doc({
            "doctype": "Item Price",
            "item_code": item_code,
            "price_list": price_list,
            "price_list_rate": rate
        }).insert(ignore_permissions=True)


@frappe.whitelist()
def search_items(
    style_no=None,
    barcode=None,
    colour=None,
    colour_code=None,
    size=None,
    mrp=None,
    wsp=None,
    group_name=None,
    limit_page_length=50
):
    """
    Every filter is applied before the limit, so the limit only trims real
    matches. Text filters are case-insensitive "contains" matches;
    MRP / WSP match the exact price.
    """

    limit_page_length = cint(limit_page_length) or 50

    def has(value):
        return value not in (None, "") and str(value).strip()

    item_filters = [["has_variants", "=", 0], ["disabled", "=", 0]]

    if has(style_no):
        item_filters.append(["variant_of", "like", f"%{style_no.strip()}%"])

    if has(group_name):
        item_filters.append(["item_group", "like", f"%{group_name.strip()}%"])

    # Filters held on child tables / Item Price each give the set of Items
    # that match; an Item must be in every set.
    matched = []

    if has(barcode):
        matched.append(set(frappe.get_all(
            "Item Barcode",
            filters={"barcode": ["like", f"%{barcode.strip()}%"]},
            pluck="parent",
        )))

    for attribute, value in (
        ("Colour", colour),
        ("Colour Code", colour_code),
        ("Size", size),
    ):
        if has(value):
            matched.append(set(frappe.get_all(
                "Item Variant Attribute",
                filters={
                    "attribute": attribute,
                    "attribute_value": ["like", f"%{value.strip()}%"],
                },
                pluck="parent",
            )))

    for price_list, value in (("MRP", mrp), ("WSP", wsp)):
        if has(value):
            matched.append(set(frappe.get_all(
                "Item Price",
                filters={"price_list": price_list, "price_list_rate": flt(value)},
                pluck="item_code",
            )))

    if matched:
        names = set.intersection(*matched)

        if not names:
            return []

        item_filters.append(["name", "in", list(names)])

    items = frappe.get_all(
        "Item",
        filters=item_filters,
        fields=["name", "item_name", "item_group"],
        order_by="variant_of asc, name asc",
        limit_page_length=limit_page_length,
    )

    if not items:
        return []

    names = [item.name for item in items]

    attributes = {}
    for d in frappe.get_all(
        "Item Variant Attribute",
        filters={"parent": ["in", names]},
        fields=["parent", "attribute", "attribute_value"],
    ):
        attributes.setdefault(d.parent, {})[d.attribute] = d.attribute_value

    prices = {}
    for d in frappe.get_all(
        "Item Price",
        filters={"item_code": ["in", names], "price_list": ["in", ["MRP", "WSP"]]},
        fields=["item_code", "price_list", "price_list_rate"],
    ):
        prices.setdefault(d.item_code, {}).setdefault(d.price_list, d.price_list_rate)

    barcodes = {}
    for d in frappe.get_all(
        "Item Barcode",
        filters={"parent": ["in", names]},
        fields=["parent", "barcode"],
        order_by="idx asc",
    ):
        barcodes.setdefault(d.parent, d.barcode)

    return [
        {
            "item_code": item.name,
            "item_name": item.item_name,
            "item_group": item.item_group,
            "colour": attributes.get(item.name, {}).get("Colour"),
            "colour_code": attributes.get(item.name, {}).get("Colour Code"),
            "size": attributes.get(item.name, {}).get("Size"),
            "barcode": barcodes.get(item.name),
            "mrp": prices.get(item.name, {}).get("MRP"),
            "wsp": prices.get(item.name, {}).get("WSP"),
        }
        for item in items
    ]


@frappe.whitelist()
def get_barcodes(items):

    items = frappe.parse_json(items)

    result = {}

    for row in items:

        barcode = frappe.db.get_value(
            "Item Barcode",
            {"parent": row["item_code"]},
            "barcode"
        )

        result[row["item_code"]] = barcode

    return result

@frappe.whitelist()
def get_item_visualizer_data(item_codes):

    if isinstance(item_codes, str):
        item_codes = frappe.parse_json(item_codes)

    items = frappe.get_all(
        "Item",
        filters={
            "item_code": ["in", item_codes]
        },
        fields=[
            "name",
            "item_code",
            "item_name"
        ]
    )

    result = {}

    for item in items:

        attrs = frappe.get_all(
            "Item Variant Attribute",
            filters={
                "parent": item.name
            },
            fields=[
                "attribute",
                "attribute_value"
            ]
        )

        data = {
            "style_no": item.item_name.split("-")[0]
            if item.item_name else "",
            "colour": "",
            "colour_code": "",
            "size": "",
            "barcode": ""
        }

        for attr in attrs:

            if attr.attribute == "Colour":
                data["colour"] = attr.attribute_value

            elif attr.attribute == "Colour Code":
                data["colour_code"] = attr.attribute_value

            elif attr.attribute == "Size":
                data["size"] = attr.attribute_value

        barcode = frappe.db.get_value(
            "Item Barcode",
            {"parent": item.name},
            "barcode"
        )

        data["barcode"] = barcode

        result[item.item_code] = data

    return result


@frappe.whitelist()
def get_item_definition(item_group):

    if not item_group:
        return {}

    if not frappe.db.exists("Item Definition", item_group):
        return {}

    return frappe.db.get_value(
        "Item Definition",
        item_group,
        [f"def_{i}" for i in range(1, 11)],
        as_dict=True
    )