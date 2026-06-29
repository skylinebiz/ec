import frappe
from frappe.utils import flt


@frappe.whitelist()
def populate_production_plan_items(doc, items):
    doc = frappe.get_doc(frappe.parse_json(doc))
    items = [frappe._dict(d) for d in frappe.parse_json(items)]

    for d in items:
        qty = flt(d.qty)

        # Check if item already exists in Production Plan
        existing = next(
            (row for row in doc.po_items if row.item_code == d.item_code), None
        )

        if existing:
            # Append quantity
            existing.planned_qty = flt(existing.planned_qty) + qty
            continue

        # Get BOM if available
        bom_no = frappe.db.get_value(
            "BOM", {"item": d.item_code, "is_default": 1, "is_active": 1}, "name"
        )

        # Add row even if bom_no is None
        row = doc.append("po_items", {})

        row.item_code = d.item_code
        row.planned_qty = qty
        row.pending_qty = qty
        row.bom_no = bom_no
        row.stock_uom = frappe.db.get_value("Item", d.item_code, "stock_uom")
        row.description = frappe.db.get_value("Item", d.item_code, "description")
        row.planned_start_date = frappe.utils.nowdate()

    return {"po_items": doc.po_items}
