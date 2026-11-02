import frappe
from frappe import _
from frappe.utils import flt

# Sales Orders that still have something left to deliver
OPEN_SO_STATUSES = ("To Deliver and Bill", "To Deliver")


@frappe.whitelist()
def get_matrix(customer, warehouse):
    """
    Ordered Dispatch grid for `customer`: one row per style + colour
    (colour code) the customer has not had delivered yet, one cell per
    size, each cell carrying

        a  this customer's order qty still to deliver
        b  total stock in the warehouse group `warehouse` (all warehouses
           under it)
        c  order qty still to deliver of every other customer
        d  allocation: qty on the customer's draft Pick List plus what its
           submitted Pick Lists have picked and not yet delivered

    All quantities are in stock UOM. The company is the warehouse group's.
    The page shows A and B less D, so they drop as D is raised.
    """
    frappe.has_permission("Sales Order", "read", throw=True)

    company = get_company(warehouse)

    result = {
        "warehouse": warehouse,
        "company": company,
        "pick_lists": get_open_pick_lists(customer, company),
        "sizes": [],
        "rows": [],
    }

    variants = get_variant_rows(customer, company)

    if not variants:
        return result

    items = tuple({d.item_code for d in variants})

    orders = get_order_qty(items, customer, company)
    stock = get_stock_qty(items, warehouse)
    allocated = get_allocated_qty([d.name for d in result["pick_lists"]])

    sizes = {}
    rows = {}

    for d in variants:
        sizes.setdefault(d.size, d.size_idx)

        row = rows.setdefault(
            (d.template, d.colour, d.colour_code),
            {
                "article": d.article,
                "template": d.template,
                "colour": d.colour,
                "colour_code": d.colour_code,
                "mrp": d.mrp,
                "cells": {},
            },
        )

        order = orders.get(d.item_code) or {}

        row["cells"][d.size] = {
            "item_code": d.item_code,
            "a": flt(order.get("a_order")),
            "b": flt(stock.get(d.item_code)),
            "c": flt(order.get("c_other")),
            "d": flt(allocated.get(d.item_code)),
        }

    result["sizes"] = sorted(sizes, key=lambda size: size_sort_key(size, sizes[size]))
    result["rows"] = list(rows.values())

    return result


def get_company(warehouse):
    """The company of the warehouse group the page works on."""
    if not warehouse:
        frappe.throw(_("Select a Warehouse Group"))

    return frappe.get_cached_value("Warehouse", warehouse, "company")


def size_sort_key(size, idx):
    """
    Numeric sizes (36, 38, ...) in number order, then the rest in their
    Size attribute order - migrated data does not keep the attribute's
    rows in size order.
    """
    try:
        return (0, float(size), "")
    except (TypeError, ValueError):
        return (1, idx, size or "")


def get_variant_rows(customer, company):
    """
    Every enabled variant sharing a style (template), Colour and Colour
    Code with something `customer` has open on a Sales Order (picked or
    not, until delivered) - so sizes the customer did
    not order still show up, with their stock. A Colour Code is not unique
    to one Colour (e.g. OR / ORANGE both 101), hence both; styles whose
    variants have no Colour Code are grouped by Colour alone.

    Attributes are pivoted from `tabItem Variant Attribute` by its indexed
    `variant_of` (one pass per style) instead of one join per attribute;
    sizes, item details and MRP are then fetched by item_code.
    """
    groups = {
        (d.template, d.colour or "", d.colour_code or "")
        for d in frappe.db.sql(
            """
            SELECT
                iva.variant_of AS template,
                MAX(IF(iva.attribute = 'Colour', iva.attribute_value, NULL)) AS colour,
                MAX(IF(iva.attribute = 'Colour Code', iva.attribute_value, NULL)) AS colour_code

            FROM `tabSales Order` so

            INNER JOIN `tabSales Order Item` soi
                ON soi.parent = so.name

            INNER JOIN `tabItem Variant Attribute` iva
                ON iva.parent = soi.item_code
                AND iva.attribute IN ('Colour', 'Colour Code')

            WHERE
                so.customer = %(customer)s
                AND so.company = %(company)s
                AND so.docstatus = 1
                AND so.status IN %(statuses)s
                AND soi.delivered_qty < soi.qty

            GROUP BY soi.item_code, iva.variant_of
            """,
            {"customer": customer, "company": company, "statuses": OPEN_SO_STATUSES},
            as_dict=True,
        )
    }

    if not groups:
        return []

    variants = [
        d
        for d in frappe.db.sql(
            """
            SELECT
                iva.parent AS item_code,
                iva.variant_of AS template,
                IFNULL(MAX(IF(iva.attribute = 'Colour', iva.attribute_value, NULL)), '') AS colour,
                IFNULL(MAX(IF(iva.attribute = 'Colour Code', iva.attribute_value, NULL)), '') AS colour_code,
                MAX(IF(iva.attribute = 'Size', iva.attribute_value, NULL)) AS size

            FROM `tabItem Variant Attribute` iva

            WHERE
                iva.variant_of IN %(templates)s
                AND iva.attribute IN ('Colour', 'Colour Code', 'Size')

            GROUP BY iva.parent, iva.variant_of
            """,
            {"templates": tuple({g[0] for g in groups})},
            as_dict=True,
        )
        if d.size and (d.template, d.colour, d.colour_code) in groups
    ]

    if not variants:
        return []

    items = tuple(d.item_code for d in variants)

    item_groups = dict(
        frappe.db.sql(
            """
            SELECT name, item_group
            FROM `tabItem`
            WHERE name IN %(items)s AND disabled = 0
            """,
            {"items": items},
        )
    )

    # latest MRP per item; rows come oldest first so later ones win
    mrp = dict(
        frappe.db.sql(
            """
            SELECT item_code, price_list_rate
            FROM `tabItem Price`
            WHERE
                item_code IN %(items)s
                AND price_list = 'MRP'
                AND IFNULL(customer, '') = ''
            ORDER BY valid_from
            """,
            {"items": items},
        )
    )

    size_idx = get_size_idx()

    rows = []
    for d in variants:
        if d.item_code not in item_groups:
            continue

        d.article = item_groups[d.item_code]
        d.mrp = mrp.get(d.item_code)
        d.size_idx = size_idx.get(d.size, 999)
        rows.append(d)

    rows.sort(
        key=lambda d: (
            d.article or "",
            flt(d.mrp),
            d.template,
            d.colour,
            d.colour_code,
            size_sort_key(d.size, d.size_idx),
        )
    )

    return rows


def get_size_idx():
    """Size attribute value -> its position in the Size attribute."""
    return dict(
        frappe.db.sql(
            """
            SELECT attribute_value, idx
            FROM `tabItem Attribute Value`
            WHERE parent = 'Size' AND parenttype = 'Item Attribute'
            """
        )
    )


def get_order_qty(items, customer, company):
    """
    A (this customer) and C (every other customer) order qty still to
    deliver per item, in stock UOM, in one pass over the open Sales Order
    rows. Picked qty is not taken off - the grid shows it as D.
    """
    rows = frappe.db.sql(
        """
        SELECT
            soi.item_code,

            SUM(CASE WHEN so.customer = %(customer)s
                THEN (soi.qty - soi.delivered_qty) * soi.conversion_factor
                ELSE 0 END) AS a_order,

            SUM(CASE WHEN so.customer <> %(customer)s
                THEN (soi.qty - soi.delivered_qty) * soi.conversion_factor
                ELSE 0 END) AS c_other

        FROM `tabSales Order Item` soi

        INNER JOIN `tabSales Order` so
            ON so.name = soi.parent

        WHERE
            soi.item_code IN %(items)s
            AND so.company = %(company)s
            AND so.docstatus = 1
            AND so.status IN %(statuses)s
            AND soi.delivered_qty < soi.qty

        GROUP BY soi.item_code
        """,
        {"items": items, "customer": customer, "company": company, "statuses": OPEN_SO_STATUSES},
        as_dict=True,
    )

    return {d.item_code: d for d in rows}


def get_stock_qty(items, warehouse):
    """B: total actual stock per item in `warehouse` and the warehouses under it."""
    lft, rgt = frappe.get_cached_value("Warehouse", warehouse, ["lft", "rgt"])

    return dict(
        frappe.db.sql(
            """
            SELECT b.item_code, SUM(b.actual_qty)

            FROM `tabBin` b

            INNER JOIN `tabWarehouse` w
                ON w.name = b.warehouse

            WHERE
                b.item_code IN %(items)s
                AND w.lft >= %(lft)s
                AND w.rgt <= %(rgt)s

            GROUP BY b.item_code
            """,
            {"items": items, "lft": lft, "rgt": rgt},
        )
    )


def get_open_pick_lists(customer, company):
    """
    The customer's Delivery Pick Lists still in play: drafts (allocated on
    this page, not picked yet) and submitted ones not fully delivered.
    [{name, docstatus}], oldest first.
    """
    return frappe.get_all(
        "Pick List",
        filters={
            "customer": customer,
            "company": company,
            "purpose": "Delivery",
            "docstatus": ("<", 2),
            "status": ("not in", ("Completed", "Cancelled")),
        },
        fields=["name", "docstatus"],
        order_by="creation",
    )


def get_allocated_qty(pick_lists):
    """
    D per item on `pick_lists` (names): qty on drafts, picked but not yet
    delivered qty on submitted ones.
    """
    if not pick_lists:
        return {}

    return dict(
        frappe.db.sql(
            """
            SELECT
                item_code,
                SUM(CASE WHEN docstatus = 0
                    THEN stock_qty
                    ELSE GREATEST(picked_qty - delivered_qty, 0) END)

            FROM `tabPick List Item`

            WHERE parent IN %(pick_lists)s AND parenttype = 'Pick List'

            GROUP BY item_code
            """,
            {"pick_lists": tuple(pick_lists)},
        )
    )


def get_pickable_so_lines(items, customer, company):
    """
    The customer's open Sales Order rows for `items` that still have qty
    left to pick (stock UOM), oldest delivery date first.
    """
    rows = frappe.db.sql(
        """
        SELECT
            soi.name AS sales_order_item,
            soi.parent AS sales_order,
            soi.item_code,
            soi.uom,
            soi.stock_uom,
            soi.conversion_factor,
            soi.warehouse,
            soi.stock_qty - GREATEST(
                IFNULL(soi.picked_qty, 0),
                soi.delivered_qty * soi.conversion_factor
            ) AS pending

        FROM `tabSales Order Item` soi

        INNER JOIN `tabSales Order` so
            ON so.name = soi.parent

        WHERE
            soi.item_code IN %(items)s
            AND so.customer = %(customer)s
            AND so.company = %(company)s
            AND so.docstatus = 1
            AND so.status IN %(statuses)s

        HAVING pending > 0

        ORDER BY so.delivery_date, so.transaction_date, so.name, soi.idx
        """,
        {"items": items, "customer": customer, "company": company, "statuses": OPEN_SO_STATUSES},
        as_dict=True,
    )

    lines = {}
    for row in rows:
        lines.setdefault(row.item_code, []).append(row)

    return lines


@frappe.whitelist(methods=["POST"])
def save_pick_list(customer, warehouse, quantities):
    """
    Make the customer's allocation match D from the grid. `quantities` is
    {item_code: qty in stock UOM} for every cell of the grid (0 included).

    What submitted Pick Lists hold is the picker's and stays; the rest of D
    goes on the customer's draft Pick List (created if there is none, other
    drafts merged into it), saved but not submitted - the picker picks and
    submits it. ERPNext splits each qty over the warehouses under
    `warehouse` that have it, as "Get Item Locations" does; what no
    warehouse has is left off and reported back instead of failing.

    Returns {"pick_list", "deleted", "short": {item_code: qty not allocated}}.
    """
    company = get_company(warehouse)

    quantities = {item_code: flt(qty) for item_code, qty in frappe.parse_json(quantities).items()}

    open_pick_lists = get_open_pick_lists(customer, company)
    drafts = [d.name for d in open_pick_lists if d.docstatus == 0]
    submitted = [d.name for d in open_pick_lists if d.docstatus == 1]

    current = get_allocated_qty(drafts + submitted)
    submitted_qty = get_allocated_qty(submitted)

    # items allocated today but not on the grid keep their allocation
    for item_code, qty in current.items():
        quantities.setdefault(item_code, qty)

    if all(flt(quantities.get(i)) == flt(current.get(i)) for i in set(quantities) | set(current)):
        return {"pick_list": None, "deleted": [], "short": {}}

    errors = [
        _("{0}: cannot allocate less than {1}, already picked on {2}").format(
            frappe.bold(item_code), qty, ", ".join(submitted)
        )
        for item_code, qty in submitted_qty.items()
        if flt(quantities.get(item_code)) < qty
    ]

    if errors:
        frappe.throw("<br>".join(errors), title=_("Cannot Change Allocation"))

    to_pick = {
        item_code: qty - flt(submitted_qty.get(item_code))
        for item_code, qty in quantities.items()
        if qty - flt(submitted_qty.get(item_code)) > 0
    }

    # the latest draft is rewritten, older ones are merged into it
    draft = drafts[-1] if drafts else None
    deleted = delete_pick_lists(drafts[:-1])

    if not to_pick:
        return {"pick_list": None, "deleted": deleted + delete_pick_lists([draft] if draft else []), "short": {}}

    doc = frappe.get_doc("Pick List", draft) if draft else frappe.new_doc("Pick List")
    set_pick_list_items(doc, customer, company, warehouse, to_pick)

    # ERPNext's "not available in any of the warehouses" message: reported as `short` instead
    frappe.flags.mute_messages = True
    try:
        doc.save()
    finally:
        frappe.flags.mute_messages = False

    allocated = get_allocated_qty([doc.name])
    short = {
        item_code: qty - flt(allocated.get(item_code))
        for item_code, qty in to_pick.items()
        if qty - flt(allocated.get(item_code)) > 0
    }

    if not doc.get("locations"):
        deleted += delete_pick_lists([doc.name])
        return {"pick_list": None, "deleted": deleted, "short": short}

    return {"pick_list": doc.name, "deleted": deleted, "short": short}


@frappe.whitelist(methods=["POST"])
def cancel_allocation(customer, warehouse):
    """
    Undo the customer's allocation: delete its draft Pick Lists and cancel
    the submitted ones that have nothing delivered yet.
    """
    company = get_company(warehouse)

    open_pick_lists = get_open_pick_lists(customer, company)
    submitted = [d.name for d in open_pick_lists if d.docstatus == 1]
    kept = get_partly_delivered(submitted)

    cancelled = [name for name in submitted if name not in kept]
    for name in cancelled:
        frappe.get_doc("Pick List", name).cancel()

    return {
        "deleted": delete_pick_lists([d.name for d in open_pick_lists if d.docstatus == 0]),
        "cancelled": cancelled,
        "kept": kept,
    }


def delete_pick_lists(pick_lists):
    for name in pick_lists:
        frappe.delete_doc("Pick List", name)

    return list(pick_lists)


def get_partly_delivered(pick_lists):
    """The Pick Lists of `pick_lists` with anything delivered against them."""
    if not pick_lists:
        return []

    return frappe.db.sql_list(
        """
        SELECT DISTINCT parent
        FROM `tabPick List Item`
        WHERE parent IN %(pick_lists)s AND parenttype = 'Pick List' AND delivered_qty > 0
        """,
        {"pick_lists": tuple(pick_lists)},
    )


def set_pick_list_items(doc, customer, company, warehouse, quantities):
    """
    Fill the Pick List `doc` with `quantities` ({item_code: stock qty}):
    each qty is spread over the customer's open Sales Order rows, oldest
    delivery date first, and whatever is left (more than ordered, or not
    ordered at all) goes on a row of its own.

    Rows carry no warehouse: with "Pick Manually" off ERPNext fills them in
    on save, splitting each row over the warehouses under `warehouse` that
    have stock (skipping what other Pick Lists already hold).
    """
    so_lines = get_pickable_so_lines(tuple(quantities), customer, company)

    doc.update(
        {
            "company": company,
            "customer": customer,
            "purpose": "Delivery",
            "parent_warehouse": warehouse,
            "pick_manually": 0,
        }
    )

    doc.set("locations", [])

    for item_code, qty in quantities.items():
        lines = so_lines.get(item_code, [])
        remaining = qty

        for line in lines:
            # never more than the Sales Order row needs: ERPNext refuses
            # over-picking a Sales Order on submit
            stock_qty = min(remaining, flt(line.pending))
            conversion_factor = flt(line.conversion_factor) or 1

            doc.append(
                "locations",
                {
                    "item_code": item_code,
                    "qty": stock_qty / conversion_factor,
                    "stock_qty": stock_qty,
                    "uom": line.uom,
                    "stock_uom": line.stock_uom,
                    "conversion_factor": conversion_factor,
                    "sales_order": line.sales_order,
                    "sales_order_item": line.sales_order_item,
                },
            )

            remaining -= stock_qty
            if remaining <= 0:
                break

        if remaining > 0:
            # nothing left to pick on the customer's orders for this item
            stock_uom = frappe.get_cached_value("Item", item_code, "stock_uom")

            doc.append(
                "locations",
                {
                    "item_code": item_code,
                    "qty": remaining,
                    "stock_qty": remaining,
                    "uom": stock_uom,
                    "stock_uom": stock_uom,
                    "conversion_factor": 1,
                },
            )
