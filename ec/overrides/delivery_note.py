import frappe
from frappe.utils import flt


def before_save(doc, method=None):
    delivery_type = doc.get("custom_ec_type")

    if not delivery_type:
        return

    if delivery_type == "Adhoc":
        validate_adhoc_items(doc)

    elif delivery_type in ("Against (FIFO)", "Against (LIFO)"):
        set_sales_order_references(doc, delivery_type)


def validate_adhoc_items(doc):
    """
    Adhoc Delivery Note must not contain Sales Order references.

    Instead of clearing the references, throw an error showing
    which items have a Sales Order reference.
    """

    items_with_so = []

    for row in doc.items:
        if row.against_sales_order:
            item_name = row.item_name or row.item_code or row.name

            items_with_so.append(
                f"{item_name} ({row.against_sales_order})"
            )

    if items_with_so:
        frappe.throw(
            "<b>Adhoc Delivery Note cannot contain Sales Order references.</b>"
            "<br><br>"
            "The following items have Sales Orders assigned:"
            "<br><br>"
            + "<br>".join(
                f"• {item}"
                for item in items_with_so
            )
            + "<br><br>"
            "Please remove the Sales Order reference before saving."
        )


def set_sales_order_references(doc, delivery_type):
    """
    Assign Delivery Note items against Sales Orders using:

    FIFO:
        Oldest Sales Order first.

    LIFO:
        Newest Sales Order first.

    Automatically splits a Delivery Note row when
    multiple Sales Orders are required.
    """

    if delivery_type == "Against (FIFO)":
        order_by = """
            so.transaction_date ASC,
            so.creation ASC,
            so.name ASC
        """
    else:
        order_by = """
            so.transaction_date DESC,
            so.creation DESC,
            so.name DESC
        """

    original_items = list(doc.items)

    # Remove original rows.
    doc.set("items", [])

    so_cache = {}

    for original_row in original_items:

        if not original_row.item_code:
            append_original_row(doc, original_row)
            continue

        original_qty = flt(original_row.qty)

        if original_qty <= 0:
            append_original_row(doc, original_row)
            continue

        item_code = original_row.item_code

        # Get SOs only once per item.
        if item_code not in so_cache:
            so_cache[item_code] = get_sales_orders(
                item_code,
                order_by
            )

        sales_orders = so_cache[item_code]

        if not sales_orders:
            frappe.throw(
                f"""
                No pending Sales Order found for item
                <b>{original_row.item_name or item_code}</b>.
                """
            )

        remaining_qty = original_qty

        for so in sales_orders:

            if remaining_qty <= 0:
                break

            pending_qty = (
                flt(so.qty)
                - flt(so.delivered_qty)
            )

            if pending_qty <= 0:
                continue

            allocation_qty = min(
                remaining_qty,
                pending_qty
            )

            # ----------------------------------------------------------
            # Create split row
            # ----------------------------------------------------------

            new_row = append_original_row(
                doc,
                original_row
            )

            # ----------------------------------------------------------
            # Set quantity
            # ----------------------------------------------------------

            new_row.qty = allocation_qty

            # ----------------------------------------------------------
            # Sales Order reference
            # ----------------------------------------------------------

            new_row.against_sales_order = so.sales_order
            new_row.so_detail = so.so_detail

            # ----------------------------------------------------------
            # Recalculate stock quantity
            # ----------------------------------------------------------

            conversion_factor = flt(
                new_row.get("conversion_factor")
            ) or 1

            new_row.stock_qty = (
                allocation_qty * conversion_factor
            )

            # ----------------------------------------------------------
            # FIX RATE / AMOUNT
            # ----------------------------------------------------------

            rate = flt(new_row.rate)

            # Rate remains the same as the original row.
            new_row.rate = rate

            # Amount must be recalculated from the NEW quantity.
            new_row.amount = (
                allocation_qty * rate
            )

            # ----------------------------------------------------------
            # Base currency values
            # ----------------------------------------------------------

            exchange_rate = flt(
                new_row.get("conversion_factor")
            ) or 1

            if new_row.get("base_rate") is not None:
                base_rate = flt(new_row.base_rate)

                new_row.base_rate = base_rate
                new_row.base_amount = (
                    allocation_qty * base_rate
                )

            # ----------------------------------------------------------
            # Net rate / net amount
            # ----------------------------------------------------------

            if new_row.get("net_rate") is not None:
                net_rate = flt(new_row.net_rate)

                new_row.net_rate = net_rate
                new_row.net_amount = (
                    allocation_qty * net_rate
                )

            # ----------------------------------------------------------
            # Base net values
            # ----------------------------------------------------------

            if new_row.get("base_net_rate") is not None:
                base_net_rate = flt(
                    new_row.base_net_rate
                )

                new_row.base_net_rate = base_net_rate
                new_row.base_net_amount = (
                    allocation_qty * base_net_rate
                )

            # ----------------------------------------------------------
            # Update remaining quantity
            # ----------------------------------------------------------

            remaining_qty -= allocation_qty

            # Update our in-memory SO quantity.
            so.delivered_qty = (
                flt(so.delivered_qty)
                + allocation_qty
            )

        # --------------------------------------------------------------
        # Not enough pending SO quantity
        # --------------------------------------------------------------

        if remaining_qty > 0:
            frappe.throw(
                f"""
                Insufficient pending Sales Order quantity for item
                <b>{original_row.item_name or item_code}</b>.
                <br><br>
                Required: <b>{original_qty}</b>
                <br>
                Available: <b>{original_qty - remaining_qty}</b>
                <br>
                Missing: <b>{remaining_qty}</b>
                """
            )



def get_sales_orders(item_code, order_by):
    """
    Return submitted Sales Order Items having pending quantity
    for the specified item.
    """

    return frappe.db.sql(
        f"""
        SELECT
            so.name AS sales_order,
            soi.name AS so_detail,

            soi.qty AS qty,
            IFNULL(soi.delivered_qty, 0) AS delivered_qty,

            so.transaction_date,
            so.creation

        FROM `tabSales Order` so

        INNER JOIN `tabSales Order Item` soi
            ON soi.parent = so.name

        WHERE
            so.docstatus = 1
            AND soi.item_code = %(item_code)s

            AND (
                soi.qty - IFNULL(soi.delivered_qty, 0)
            ) > 0

        ORDER BY
            {order_by}
        """,
        {
            "item_code": item_code
        },
        as_dict=True
    )


def append_original_row(doc, original_row):
    """
    Create a new Delivery Note Item row and copy the original
    row's values.

    This prevents important fields such as warehouse, UOM,
    rate, batch, etc. from being lost when splitting.
    """

    new_row = doc.append("items", {})

    # Copy all fields from original row that are valid in the
    # Delivery Note Item child table.

    meta = frappe.get_meta("Delivery Note Item")

    valid_fields = {
        field.fieldname
        for field in meta.fields
        if field.fieldtype not in (
            "Section Break",
            "Column Break",
            "Tab Break",
            "HTML",
            "Table",
            "Table MultiSelect",
        )
    }

    for fieldname in valid_fields:

        if fieldname in (
            "name",
            "parent",
            "parentfield",
            "parenttype",
            "idx",
            "creation",
            "modified",
            "modified_by",
            "owner",
            "docstatus",
        ):
            continue

        if original_row.get(fieldname) is not None:
            new_row.set(
                fieldname,
                original_row.get(fieldname)
            )

    return new_row

