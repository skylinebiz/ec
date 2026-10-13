import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime


# Rows rendered per QZ Tray job, keeps large prints within the printer buffer
RAW_COMMAND_CHUNK_SIZE = 100

# group_field: lots carry one row per operation (and employee) for the same
# item, so qty is summed per operation and the largest operation qty is used
ITEM_SOURCES = {
    "Production Plan": {
        "child_doctype": "Production Plan Item",
        "item_field": "item_code",
        "qty_field": "planned_qty",
    },
    "EC Lot": {
        "child_doctype": "EC Lot Item",
        "item_field": "item",
        "qty_field": "qty",
        "group_field": "operation",
    },
    "EC Process Lot": {
        "child_doctype": "EC Process Lot Item",
        "item_field": "item",
        "qty_field": "qty",
        "group_field": "operation",
    },
}


def get_label_details(item_codes):

    item_codes = list({item_code for item_code in item_codes if item_code})

    if not item_codes:
        return {}

    details = {}

    for item in frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=["name", "item_name", "variant_of"],
    ):
        details[item.name] = {
            "item_name": item.item_name,
            "style_no": item.variant_of or item.name,
            "colour": None,
            "colour_code": None,
            "size": None,
            "barcode": None,
            "mrp": 0,
        }

    attribute_fields = {
        "Colour": "colour",
        "Colour Code": "colour_code",
        "Size": "size",
    }

    for attr in frappe.get_all(
        "Item Variant Attribute",
        filters={
            "parent": ["in", item_codes],
            "parenttype": "Item",
            "attribute": ["in", list(attribute_fields)],
        },
        fields=["parent", "attribute", "attribute_value"],
    ):
        if attr.parent in details:
            details[attr.parent][attribute_fields[attr.attribute]] = attr.attribute_value

    for barcode in frappe.get_all(
        "Item Barcode",
        filters={"parent": ["in", item_codes], "parenttype": "Item"},
        fields=["parent", "barcode"],
        order_by="idx asc",
    ):
        if barcode.parent in details and not details[barcode.parent]["barcode"]:
            details[barcode.parent]["barcode"] = barcode.barcode

    for price in frappe.get_all(
        "Item Price",
        filters={"item_code": ["in", item_codes], "price_list": "MRP"},
        fields=["item_code", "price_list_rate"],
    ):
        if price.item_code in details:
            details[price.item_code]["mrp"] = flt(price.price_list_rate)

    return details


@frappe.whitelist()
def get_item_label_details(item_codes):

    frappe.has_permission("Item", "read", throw=True)

    return get_label_details(frappe.parse_json(item_codes))


@frappe.whitelist()
def get_items_from(source_doctype, source_names):

    source = ITEM_SOURCES.get(source_doctype)

    if not source or not frappe.db.exists("DocType", source_doctype):
        frappe.throw(_("Items cannot be fetched from {0}").format(source_doctype))

    source_names = frappe.parse_json(source_names)

    if not source_names:
        return []

    # get_list applies the user's permissions on the source documents
    source_names = frappe.get_list(
        source_doctype,
        filters={"name": ["in", source_names]},
        pluck="name",
        order_by="creation asc",
    )

    if not source_names:
        return []

    item_field = source["item_field"]
    qty_field = source["qty_field"]
    group_field = source.get("group_field")

    fields = ["parent", item_field, qty_field]

    if group_field:
        fields.append(group_field)

    grouped = {}

    for row in frappe.get_all(
        source["child_doctype"],
        filters={"parent": ["in", source_names], "parenttype": source_doctype},
        fields=fields,
        order_by="parent asc, idx asc",
    ):
        item_code = row.get(item_field)

        if not item_code:
            continue

        groups = grouped.setdefault((row.parent, item_code), {})
        group = row.get(group_field) if group_field else None
        groups[group] = groups.get(group, 0) + flt(row.get(qty_field))

    details = get_label_details([item_code for _parent, item_code in grouped])

    result = []

    for (parent, item_code), groups in grouped.items():

        qty = cint(max(groups.values()))

        if qty <= 0:
            continue

        result.append({
            "item_code": item_code,
            "qty": qty,
            "source_doctype": source_doctype,
            "source_name": parent,
            **details.get(item_code, {}),
        })

    return result


@frappe.whitelist()
def get_raw_commands(name, print_format):

    from frappe.www.printview import get_print_format_doc, get_rendered_template

    if not print_format:
        frappe.throw(_("Please select a Barcode Print Format"))

    doc = frappe.get_doc("Barcode Print", name)
    doc.check_permission("print")

    print_format = get_print_format_doc(print_format, meta=doc.meta)

    if not print_format or not print_format.raw_printing:
        frappe.throw(_("Please select a raw printing Print Format"))

    rows = [row for row in doc.items if cint(row.qty) > 0]

    if not rows:
        frappe.throw(_("There are no labels to print"))

    commands = []

    for start in range(0, len(rows), RAW_COMMAND_CHUNK_SIZE):

        doc.items = rows[start:start + RAW_COMMAND_CHUNK_SIZE]

        commands.append(
            get_rendered_template(
                doc=doc,
                print_format=print_format,
                meta=doc.meta,
            )
        )

    return commands


@frappe.whitelist()
def mark_printed(name):

    doc = frappe.get_doc("Barcode Print", name)
    doc.check_permission("print")

    doc.db_set({
        "printed_on": now_datetime(),
        "print_count": cint(doc.print_count) + 1,
    })
