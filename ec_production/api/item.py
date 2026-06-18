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



# @frappe.whitelist()
# def create_style(
#     style_name,
#     attribute_1,
#     attribute_1_values,
#     attribute_2=None,
#     attribute_2_values=None,
#     mrp=None,
#     wsp=None,
# ):

#     # -------------------------
#     # Parse MultiCheck values
#     # -------------------------

#     if isinstance(attribute_1_values, str):
#         attribute_1_values = frappe.parse_json(attribute_1_values)

#     if isinstance(attribute_2_values, str):
#         attribute_2_values = frappe.parse_json(attribute_2_values)

#     # MultiCheck may return dict
#     if isinstance(attribute_1_values, dict):
#         attribute_1_values = [
#             k for k, v in attribute_1_values.items()
#             if v
#         ]

#     if isinstance(attribute_2_values, dict):
#         attribute_2_values = [
#             k for k, v in attribute_2_values.items()
#             if v
#         ]

#     if not attribute_1_values:
#         frappe.throw(_("Please select values for {0}").format(attribute_1))

#     # -------------------------
#     # Create Template
#     # -------------------------

#     if frappe.db.exists("Item", style_name):

#         template = frappe.get_doc(
#             "Item",
#             style_name,
#         )

#     else:

#         attributes = [
#             {
#                 "attribute": attribute_1
#             }
#         ]

#         if attribute_2:
#             attributes.append(
#                 {
#                     "attribute": attribute_2
#                 }
#             )

#         template = frappe.get_doc(
#             {
#                 "doctype": "Item",
#                 "item_code": style_name,
#                 "item_name": style_name,
#                 "item_group": "EC Items",
#                 "stock_uom": "Nos",
#                 "has_variants": 1,
#                 "is_stock_item": 1,
#                 "attributes": attributes,
#             }
#         )

#         template.insert(ignore_permissions=True)

#     # -------------------------
#     # Update Attributes
#     # -------------------------

#     existing_attrs = {
#         d.attribute
#         for d in template.attributes
#     }

#     changed = False

#     if attribute_1 not in existing_attrs:

#         template.append(
#             "attributes",
#             {
#                 "attribute": attribute_1
#             }
#         )

#         changed = True

#     if (
#         attribute_2
#         and attribute_2 not in existing_attrs
#     ):

#         template.append(
#             "attributes",
#             {
#                 "attribute": attribute_2
#             }
#         )

#         changed = True

#     if changed:
#         template.save(ignore_permissions=True)

#     # -------------------------
#     # Generate Variants
#     # -------------------------

#     created = []

#     if attribute_2 and attribute_2_values:

#         for value1, value2 in product(
#             attribute_1_values,
#             attribute_2_values,
#         ):

#             variant_attributes = {
#                 attribute_1: value1,
#                 attribute_2: value2,
#             }

#             variant = get_or_create_variant(
#                 template.name,
#                 variant_attributes,
#             )

#             update_price(
#                 variant,
#                 "MRP",
#                 mrp,
#             )

#             update_price(
#                 variant,
#                 "WSP",
#                 wsp,
#             )

#             created.append(variant)

#     else:

#         for value1 in attribute_1_values:

#             variant_attributes = {
#                 attribute_1: value1
#             }

#             variant = get_or_create_variant(
#                 template.name,
#                 variant_attributes,
#             )

#             update_price(
#                 variant,
#                 "MRP",
#                 mrp,
#             )

#             update_price(
#                 variant,
#                 "WSP",
#                 wsp,
#             )

#             created.append(variant)

#     frappe.db.commit()

#     return {
#         "template": template.name,
#         "variants": created,
#         "count": len(created),
#     }


# def get_or_create_variant(template, attributes):

#     frappe.logger().info(
#         f"CHECKING VARIANT template={template}"
#     )

#     variants = frappe.get_all(
#         "Item",
#         filters={"variant_of": template},
#         pluck="name",
#     )

#     frappe.logger().info(
#         f"EXISTING VARIANTS={variants}"
#     )

#     for variant_name in variants:

#         rows = frappe.get_all(
#             "Item Variant Attribute",
#             filters={"parent": variant_name},
#             fields=["attribute", "attribute_value"],
#         )

#         existing = {
#             row.attribute: row.attribute_value
#             for row in rows
#         }

#         frappe.logger().info(
#             f"VARIANT={variant_name} ATTRS={existing}"
#         )

#         if existing == attributes:

#             frappe.logger().info(
#                 f"FOUND EXISTING={variant_name}"
#             )

#             return variant_name

#     frappe.logger().info(
#         f"CREATING NEW VARIANT={attributes}"
#     )

#     variant_doc = create_variant(
#         template,
#         attributes,
#     )

#     frappe.logger().info(
#         f"CREATE_VARIANT RESULT={variant_doc}"
#     )

#     frappe.logger().info(
#         f"TYPE={type(variant_doc)}"
#     )

#     if hasattr(variant_doc, "name"):
#         frappe.logger().info(
#             f"NAME={variant_doc.name}"
#         )

#     if hasattr(variant_doc, "is_new"):
#         frappe.logger().info(
#             f"IS_NEW={variant_doc.is_new()}"
#         )

#     if hasattr(variant_doc, "as_dict"):
#         frappe.logger().info(
#             f"DOC={variant_doc.as_dict()}"
#         )

#     try:

#         variant_doc.insert(
#             ignore_permissions=True
#         )

#         frappe.logger().info(
#             f"INSERTED={variant_doc.name}"
#         )

#         return variant_doc.name

#     except Exception:

#         frappe.logger().error(
#             frappe.get_traceback()
#         )

#         raise


# def update_price(
#     item_code,
#     price_list,
#     rate,
# ):

#     if not rate:
#         return

#     existing = frappe.db.get_value(
#         "Item Price",
#         {
#             "item_code": item_code,
#             "price_list": price_list,
#         },
#     )

#     if existing:

#         doc = frappe.get_doc(
#             "Item Price",
#             existing,
#         )

#         doc.price_list_rate = rate

#         doc.save(
#             ignore_permissions=True
#         )

#     else:

#         frappe.get_doc(
#             {
#                 "doctype": "Item Price",
#                 "item_code": item_code,
#                 "price_list": price_list,
#                 "price_list_rate": rate,
#             }
#         ).insert(
#             ignore_permissions=True
#         )


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

    # --------------------------------
    # Create Template
    # --------------------------------

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
                {"attribute": "Size"},
                {"attribute": "Colour Code"},
            ]
        })

        template.insert(ignore_permissions=True)

    else:

        template = frappe.get_doc(
            "Item",
            template_name
        )

    # --------------------------------
    # Create Variants
    # --------------------------------

    created = []

    for row in rows:

        colour = str(row["colour_name"]).strip()
        size = str(row["size"]).strip()
        colour_code = str(row["colour_code"]).strip()

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
            "Size": size,
            "Colour Code": colour_code,
        }

        variant = get_or_create_variant(
            template.name,
            attributes
        )

        # Optional: store colour code on variant item
        # item = frappe.get_doc("Item", variant)
        # item.db_set("colour_code", colour_code)

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

    frappe.logger("item").info(
        f"Template = {template}"
    )

    frappe.logger("item").info(
        f"Attributes = {attributes}"
    )

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

