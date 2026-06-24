import frappe
from frappe import _
from erpnext.controllers.item_variant import create_variant
from itertools import product
from frappe.utils import flt
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
def get_colour_values():

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
    colour=None,
    colour_code=None,
    size=None,
    mrp=None,
    wsp=None,
    group_name=None,
):
    item_filters = []

    if style_no:
        item_filters.append(
            ["Item", "item_name", "like", f"%{style_no}%"]
        )

    if group_name:
        item_filters.append(
            ["Item", "item_group", "like", f"%{group_name}%"]
        )

    items = frappe.get_all(
        "Item",
        filters=[
            *item_filters,
            ["Item", "has_variants", "=", 0]
        ],
        fields=[
            "name",
            "item_name",
            "item_group",
        ],
        limit_page_length=500,
    )

    result = []

    for item in items:

        attributes = {
            d.attribute: d.attribute_value
            for d in frappe.get_all(
                "Item Variant Attribute",
                filters={"parent": item.name},
                fields=["attribute", "attribute_value"],
            )
        }

        item_colour = attributes.get("Colour")
        item_colour_code = attributes.get("Colour Code")
        item_size = attributes.get("Size")

        if colour and colour.lower() not in (item_colour or "").lower():
            continue

        if colour_code and colour_code.lower() not in (item_colour_code or "").lower():
            continue

        if size and size.lower() not in (item_size or "").lower():
            continue

        mrp_price = frappe.db.get_value(
            "Item Price",
            {
                "item_code": item.name,
                "price_list": "MRP",
            },
            "price_list_rate",
        )

        wsp_price = frappe.db.get_value(
            "Item Price",
            {
                "item_code": item.name,
                "price_list": "WSP",
            },
            "price_list_rate",
        )

        if mrp and flt(mrp_price) != flt(mrp):
            continue

        if wsp and flt(wsp_price) != flt(wsp):
            continue

        barcode = frappe.db.get_value(
            "Item Barcode",
            {"parent": item.name},
            "barcode"
        )

        result.append({
            "item_code": item.name,
            "item_name": item.item_name,
            "item_group": item.item_group,
            "colour": item_colour,
            "colour_code": item_colour_code,
            "size": item_size,
            "barcode": barcode,
            "mrp": mrp_price,
            "wsp": wsp_price,
        })

    return result


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