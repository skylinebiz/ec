import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_pick_list_allocation(delivery_note, customer, company, items):
    """
    Match the rows of a draft Delivery Note made by hand to what the
    customer's open Pick Lists have picked and not delivered yet, so the
    Delivery Note updates the Pick Lists' delivered qty on submit and the
    Ordered Dispatch page stops counting that stock as allocated.

    `items` is [{name, item_code, stock_qty, so_detail, ...}] of the
    Delivery Note's rows. Rows already on a Pick List, with a Sales Order
    row of their own (only that row's picks match), or of batch / serial
    items (their bundle has to match the pick, not part of it) are skipped.

    Pick List rows are taken oldest Pick List first, never more than they
    have picked and not delivered, less what this and other draft Delivery
    Notes already link to them.

    Returns {row name: [{pick_list, pick_list_item, stock_qty, warehouse,
    sales_order, so_detail}]}.
    """
    frappe.has_permission("Delivery Note", "write", throw=True)

    items = frappe.parse_json(items)

    linked = {}
    for row in items:
        if row.get("pick_list_item"):
            linked[row["pick_list_item"]] = linked.get(row["pick_list_item"], 0) + flt(row.get("stock_qty"))

    rows = [row for row in items if can_link(row)]
    if not rows:
        return {}

    pick_rows = get_pending_pick_rows(tuple({row["item_code"] for row in rows}), customer, company)
    if not pick_rows:
        return {}

    on_drafts = get_qty_on_drafts(tuple(d.name for d in pick_rows), delivery_note)

    for d in pick_rows:
        d.pending -= flt(on_drafts.get(d.name)) + flt(linked.get(d.name))

    allocation = {}

    for row in rows:
        remaining = flt(row.get("stock_qty"))

        for d in pick_rows:
            if remaining <= 0:
                break

            if d.item_code != row["item_code"] or d.pending <= 0:
                continue

            if row.get("so_detail") and d.sales_order_item != row["so_detail"]:
                continue

            stock_qty = min(remaining, d.pending)

            allocation.setdefault(row["name"], []).append(
                {
                    "pick_list": d.pick_list,
                    "pick_list_item": d.name,
                    "stock_qty": stock_qty,
                    "warehouse": d.warehouse,
                    "sales_order": d.sales_order,
                    "so_detail": d.sales_order_item,
                }
            )

            d.pending -= stock_qty
            remaining -= stock_qty

    return allocation


def can_link(row):
    if row.get("against_pick_list") or not row.get("item_code") or flt(row.get("stock_qty")) <= 0:
        return False

    if row.get("serial_and_batch_bundle") or row.get("batch_no") or row.get("serial_no"):
        return False

    has_batch_no, has_serial_no = frappe.get_cached_value(
        "Item", row["item_code"], ["has_batch_no", "has_serial_no"]
    )

    return not (has_batch_no or has_serial_no)


def get_pending_pick_rows(items, customer, company):
    """The customer's submitted Delivery Pick List rows for `items` with picked qty left to deliver."""
    return frappe.db.sql(
        """
        SELECT
            pli.name,
            pli.parent AS pick_list,
            pli.item_code,
            pli.warehouse,
            pli.sales_order,
            pli.sales_order_item,
            pli.picked_qty - pli.delivered_qty AS pending

        FROM `tabPick List Item` pli

        INNER JOIN `tabPick List` pl
            ON pl.name = pli.parent

        WHERE
            pli.item_code IN %(items)s
            AND pli.parenttype = 'Pick List'
            AND pli.picked_qty > pli.delivered_qty
            AND IFNULL(pli.product_bundle_item, '') = ''
            AND pl.customer = %(customer)s
            AND pl.company = %(company)s
            AND pl.purpose = 'Delivery'
            AND pl.docstatus = 1
            AND pl.status NOT IN ('Completed', 'Cancelled')

        ORDER BY pl.creation, pli.idx
        """,
        {"items": items, "customer": customer, "company": company},
        as_dict=True,
    )


def get_qty_on_drafts(pick_list_items, delivery_note):
    """Stock qty other draft Delivery Notes link to each of `pick_list_items`."""
    return dict(
        frappe.db.sql(
            """
            SELECT dni.pick_list_item, SUM(dni.stock_qty)

            FROM `tabDelivery Note Item` dni

            INNER JOIN `tabDelivery Note` dn
                ON dn.name = dni.parent

            WHERE
                dni.pick_list_item IN %(pick_list_items)s
                AND dn.docstatus = 0
                AND dn.name <> %(delivery_note)s

            GROUP BY dni.pick_list_item
            """,
            {"pick_list_items": pick_list_items, "delivery_note": delivery_note},
        )
    )
