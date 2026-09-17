import json

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, now_datetime

FIFO_ORDER_BY = """
    dn.posting_date ASC,
    dn.posting_time ASC,
    dn.creation ASC,
    dn.name ASC
"""

LIFO_ORDER_BY = """
    dn.posting_date DESC,
    dn.posting_time DESC,
    dn.creation DESC,
    dn.name DESC
"""

def get_candidate_rows(item_code, order, customer=None):
    """
    Submitted (non-return) Delivery Note rows carrying `item_code` (for
    `customer`, when given), oldest Delivery Note first (FIFO) or newest
    first (LIFO).
    """
    order_by = LIFO_ORDER_BY if order == "LIFO" else FIFO_ORDER_BY

    conditions = ""
    values = {"item_code": item_code}

    if customer:
        conditions = "AND dn.customer = %(customer)s"
        values["customer"] = customer

    return frappe.db.sql(
        f"""
        SELECT
            dn.name AS delivery_note,
            dn.customer AS customer,
            dn.posting_date AS posting_date,

            dni.name AS dn_detail,
            dni.item_name AS item_name,
            dni.qty AS qty,
            dni.rate AS rate,
            dni.uom AS uom,
            dni.conversion_factor AS conversion_factor

        FROM `tabDelivery Note` dn

        INNER JOIN `tabDelivery Note Item` dni
            ON dni.parent = dn.name

        WHERE
            dn.docstatus = 1
            AND dn.is_return = 0
            AND dni.item_code = %(item_code)s
            {conditions}

        ORDER BY {order_by}
        """,
        values,
        as_dict=True,
    )


def get_returnable_rows_for_item(item_code, order, customer=None):
    """
    Every submitted Delivery Note row carrying `item_code` (for `customer`,
    when given) that still has a returnable qty (i.e. not already fully
    returned/"billed off"), in FIFO/LIFO order, each annotated with its
    own returnable_qty.
    """
    from erpnext.controllers.sales_and_purchase_return import get_returned_qty_map_for_row

    rows = []

    for row in get_candidate_rows(item_code, order, customer):
        returned = get_returned_qty_map_for_row(
            row.delivery_note, row.customer, row.dn_detail, "Delivery Note"
        )
        already_returned = flt(returned.get("qty") if returned else 0)

        returnable_qty = flt(row.qty) - already_returned
        if returnable_qty <= 0:
            continue

        rows.append(
            {
                "item_code": item_code,
                "item_name": row.item_name,
                "delivery_note": row.delivery_note,
                "dn_detail": row.dn_detail,
                "posting_date": row.posting_date,
                "uom": row.uom,
                "rate": flt(row.rate),
                "returnable_qty": returnable_qty,
            }
        )

    return rows


@frappe.whitelist()
def find_return_allocations(items, order="FIFO", customer=None):
    """
    items: list of {item_code, qty}
    order: "FIFO" (oldest Delivery Note first) or "LIFO" (newest first)
    customer: restrict matches to Delivery Notes for this Customer

    For each item, lists EVERY submitted Delivery Note (for `customer`,
    when given) that still has a returnable qty for that item (in the
    given order) - not just the minimum needed to cover the requested
    qty - along with a suggested per-row qty (greedily split across rows
    in order) that the qty can still be edited from before processing.

    Returns {"rows": [...], "shortfalls": [...]} - rows are one per
    (item, source Delivery Note), shortfalls list any item whose requested
    qty exceeds what's returnable in total across all its rows.
    """
    frappe.has_permission("Delivery Note", throw=True)

    if isinstance(items, str):
        items = json.loads(items)

    order = "LIFO" if str(order).upper() == "LIFO" else "FIFO"

    rows = []
    shortfalls = []

    for d in items:
        item_code = d.get("item_code")
        qty = flt(d.get("qty"))

        if not item_code or qty <= 0:
            continue

        item_rows = get_returnable_rows_for_item(item_code, order, customer)

        remaining = qty
        for row in item_rows:
            suggested_qty = max(min(remaining, row["returnable_qty"]), 0)
            row["qty"] = suggested_qty
            remaining -= suggested_qty

        total_returnable = sum(flt(row["returnable_qty"]) for row in item_rows)
        rows.extend(item_rows)

        if total_returnable < qty:
            shortfalls.append(
                {
                    "item_code": item_code,
                    "requested_qty": qty,
                    "returnable_qty": total_returnable,
                    "shortfall_qty": qty - total_returnable,
                }
            )

    return {"rows": rows, "shortfalls": shortfalls}


@frappe.whitelist()
def process_returns(delivery_note, items):
    """
    Create and submit ONE return Delivery Note against `delivery_note`,
    covering every {item_code, qty} in `items` - so several items
    returned from the same source Delivery Note become a single return
    document, not one per item. Call this once per distinct
    `delivery_note` (group find_return_allocations' result rows by
    delivery_note before calling).

    Only item_code and qty are taken from the caller; everything else
    (rate, uom, warehouse, taxes, transporter/vehicle info, sales team,
    which original row a qty is drawn from, ...) is resolved from
    `delivery_note` itself via erpnext's own make_sales_return() - the
    same mapper behind ERPNext's standard "Sales Return" button. Each
    entry's qty is capped to what that item still has returnable.

    Note: if the same item_code appears on more than one row of
    `delivery_note` (e.g. different rate/batch/Sales Order reference),
    matching is by item_code only - the first still-returnable row wins,
    not necessarily a specific one.
    """
    from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_return

    frappe.has_permission("Delivery Note", doc=delivery_note, throw=True)

    if isinstance(items, str):
        items = json.loads(items)

    requested_items = []
    for d in items:
        item_code = d.get("item_code")
        qty = flt(d.get("qty"))

        if item_code and qty > 0:
            requested_items.append(
                {
                    "item_code": item_code,
                    "qty": qty,
                }
            )

    if not requested_items:
        frappe.throw(_("Please add at least one item to return."))

    return_doc = make_sales_return(delivery_note)

    # ERPNext requires a return's posting datetime to be on/after the
    # original document's. make_sales_return() copies the original's
    # posting_date/time, but TransactionBase.validate_posting_time()
    # silently overwrites it with the server's current time on insert
    # unless set_posting_time is set - so if the original was posted
    # later than "now" (e.g. a future-dated document), the return would
    # otherwise fail that check. Anchor to whichever is later.
    # original_posting_date, original_posting_time = frappe.db.get_value(
    #     "Delivery Note", delivery_note, ["posting_date", "posting_time"]
    # )
    # original_dt = get_datetime(f"{original_posting_date} {original_posting_time or '00:00:00'}")
    # posting_dt = max(now_datetime(), original_dt)

    # return_doc.set_posting_time = 1
    # return_doc.posting_date = posting_dt.strftime("%Y-%m-%d")
    # return_doc.posting_time = posting_dt.strftime("%H:%M:%S.%f")

    return_rows = []

    for requested_item in requested_items:

        matched_row = None

        for row in return_doc.items:
            if row.item_code != requested_item["item_code"]:
                continue

            # already claimed by an earlier entry in this same call
            if row in return_rows:
                continue

            if flt(row.qty) * -1 <= 0:
                continue

            matched_row = row
            break

        if not matched_row:
            frappe.throw(
                _("{0} is not returnable against {1} for the requested quantity.").format(
                    frappe.bold(requested_item["item_code"]), frappe.bold(delivery_note)
                )
            )

        max_returnable = flt(matched_row.qty) * -1
        return_qty = min(requested_item["qty"], max_returnable)

        matched_row.qty = -1 * return_qty

        return_rows.append(matched_row)

    for idx, row in enumerate(return_rows, start=1):
        row.idx = idx

    return_doc.set("items", return_rows)
    return_doc.insert()
    return_doc.submit()

    return return_doc.name
