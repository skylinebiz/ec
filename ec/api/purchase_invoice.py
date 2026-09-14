import json

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, now_datetime

FIFO_ORDER_BY = """
    pi.posting_date ASC,
    pi.posting_time ASC,
    pi.creation ASC,
    pi.name ASC
"""

LIFO_ORDER_BY = """
    pi.posting_date DESC,
    pi.posting_time DESC,
    pi.creation DESC,
    pi.name DESC
"""

def get_candidate_rows(item_code, order, supplier=None):
    """
    Submitted (non-return) Purchase Invoice rows carrying `item_code` (for
    `supplier`, when given), oldest Purchase Invoice first (FIFO) or newest
    first (LIFO).
    """
    order_by = LIFO_ORDER_BY if order == "LIFO" else FIFO_ORDER_BY

    conditions = ""
    values = {"item_code": item_code}

    if supplier:
        conditions = "AND pi.supplier = %(supplier)s"
        values["supplier"] = supplier

    return frappe.db.sql(
        f"""
        SELECT
            pi.name AS purchase_invoice,
            pi.supplier AS supplier,
            pi.posting_date AS posting_date,

            pii.name AS pi_detail,
            pii.item_name AS item_name,
            pii.qty AS qty,
            pii.rate AS rate,
            pii.uom AS uom,
            pii.conversion_factor AS conversion_factor

        FROM `tabPurchase Invoice` pi

        INNER JOIN `tabPurchase Invoice Item` pii
            ON pii.parent = pi.name

        WHERE
            pi.docstatus = 1
            AND pi.is_return = 0
            AND pii.item_code = %(item_code)s
            {conditions}

        ORDER BY {order_by}
        """,
        values,
        as_dict=True,
    )


def get_returnable_rows_for_item(item_code, order, supplier=None):
    """
    Every submitted Purchase Invoice row carrying `item_code` (for
    `supplier`, when given) that still has a returnable qty (i.e. not
    already fully returned/"billed off"), in FIFO/LIFO order, each
    annotated with its own returnable_qty.
    """
    from erpnext.controllers.sales_and_purchase_return import get_returned_qty_map_for_row

    rows = []

    for row in get_candidate_rows(item_code, order, supplier):
        returned = get_returned_qty_map_for_row(
            row.purchase_invoice, row.supplier, row.pi_detail, "Purchase Invoice"
        )
        already_returned = flt(returned.get("qty") if returned else 0)

        returnable_qty = flt(row.qty) - already_returned
        if returnable_qty <= 0:
            continue

        rows.append(
            {
                "item_code": item_code,
                "item_name": row.item_name,
                "purchase_invoice": row.purchase_invoice,
                "pi_detail": row.pi_detail,
                "posting_date": row.posting_date,
                "uom": row.uom,
                "rate": flt(row.rate),
                "returnable_qty": returnable_qty,
            }
        )

    return rows


@frappe.whitelist()
def find_return_allocations(items, order="FIFO", supplier=None):
    """
    items: list of {item_code, qty}
    order: "FIFO" (oldest Purchase Invoice first) or "LIFO" (newest first)
    supplier: restrict matches to Purchase Invoices for this Supplier

    For each item, lists EVERY submitted Purchase Invoice (for `supplier`,
    when given) that still has a returnable qty for that item (in the
    given order) - not just the minimum needed to cover the requested
    qty - along with a suggested per-row qty (greedily split across rows
    in order) that can still be edited from before processing.

    Returns {"rows": [...], "shortfalls": [...]} - rows are one per
    (item, source Purchase Invoice), shortfalls list any item whose
    requested qty exceeds what's returnable in total across all its rows.
    """
    frappe.has_permission("Purchase Invoice", throw=True)

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

        item_rows = get_returnable_rows_for_item(item_code, order, supplier)

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
def process_returns(purchase_invoice, items):
    """
    Create and submit ONE debit note (return Purchase Invoice) against
    `purchase_invoice`, covering every {item_code, qty} in `items` - so
    several items returned from the same source Purchase Invoice become
    a single return document, not one per item. Call this once per
    distinct `purchase_invoice` (group find_return_allocations' result
    rows by purchase_invoice before calling).

    Only item_code and qty are taken from the caller; everything else
    (rate, uom, warehouse, taxes, payment terms, which original row a
    qty is drawn from, ...) is resolved from `purchase_invoice` itself
    via erpnext's own make_debit_note() - the same mapper behind
    ERPNext's standard "Debit Note" button. Each entry's qty is capped
    to what that item still has returnable.

    Note: if the same item_code appears on more than one row of
    `purchase_invoice` (e.g. different rate/batch/Purchase Order
    reference), matching is by item_code only - the first still-returnable
    row wins, not necessarily a specific one.
    """
    from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import make_debit_note

    frappe.has_permission("Purchase Invoice", doc=purchase_invoice, throw=True)

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

    return_doc = make_debit_note(purchase_invoice)

    # ERPNext requires a return's posting datetime to be on/after the
    # original document's. make_debit_note() copies the original's
    # posting_date/time, but TransactionBase.validate_posting_time()
    # silently overwrites it with the server's current time on insert
    # unless set_posting_time is set - so if the original was posted
    # later than "now" (e.g. a future-dated document), the return would
    # otherwise fail that check. Anchor to whichever is later.
    # original_posting_date, original_posting_time = frappe.db.get_value(
    #     "Purchase Invoice", purchase_invoice, ["posting_date", "posting_time"]
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
                    frappe.bold(requested_item["item_code"]), frappe.bold(purchase_invoice)
                )
            )

        max_returnable = flt(matched_row.qty) * -1
        return_qty = min(requested_item["qty"], max_returnable)

        matched_row.qty = -1 * return_qty

        # make_debit_note() paired received_qty/rejected_qty to the FULL
        # returnable qty; since we may be returning less than that, they
        # have to be re-paired to the (possibly smaller) qty we just set,
        # or ERPNext's own "Received Qty must be equal to Accepted +
        # Rejected Qty" check fails for stock-affecting (update_stock)
        # Purchase Invoices. This flow has no concept of a rejected
        # portion, so the full returned qty is treated as accepted.
        if matched_row.meta.get_field("received_qty"):
            matched_row.received_qty = matched_row.qty
        if matched_row.meta.get_field("rejected_qty"):
            matched_row.rejected_qty = 0

        return_rows.append(matched_row)

    for idx, row in enumerate(return_rows, start=1):
        row.idx = idx

    return_doc.set("items", return_rows)
    return_doc.insert()
    return_doc.submit()

    return return_doc.name
