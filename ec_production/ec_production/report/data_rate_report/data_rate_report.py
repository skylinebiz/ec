# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
    filters = filters or {}

    selected_date = filters.get("effective_date")

    # records = frappe.db.sql("""
    #     SELECT
    #         r.item,
    #         r.operation,
    #         r.rate
    #     FROM `tabEC Item Operation Rate` r
    #     INNER JOIN (
    #         SELECT
    #             item,
    #             operation,
    #             MAX(effective_from) AS effective_from
    #         FROM `tabEC Item Operation Rate`
    #         WHERE effective_from <= %(date)s
    #         GROUP BY item, operation
    #     ) latest
    #     ON latest.item = r.item
    #     AND latest.operation = r.operation
    #     AND latest.effective_from = r.effective_from
    #     ORDER BY r.item
    # """, {"date": selected_date}, as_dict=True)

    records = frappe.get_all(
        "EC Item Operation Rate",
        filters={
            "effective_from": ["<=", selected_date]
        },
        fields=["item", "operation", "rate", "effective_from"],
        order_by="item asc, operation asc, effective_from desc"
    )

    # Keep latest rate for each Item + Operation
    latest_rates = {}

    for row in records:
        key = (row.item, row.operation)

        if key not in latest_rates:
            latest_rates[key] = row

    records = list(latest_rates.values())
    
    operations = sorted(
        list({r.operation for r in records if r.operation})
    )

    columns = [
        {
            "label": "Item",
            "fieldname": "item",
            "fieldtype": "Link",
            "options": "Item",
            "width": 200,
        }
    ]

    for operation in operations:
        columns.append({
            "label": operation,
            "fieldname": frappe.scrub(operation),
            "fieldtype": "Currency",
            "width": 120,
        })

    data_map = {}

    for row in records:
        if row.item not in data_map:
            data_map[row.item] = {
                "item": row.item
            }

        data_map[row.item][frappe.scrub(row.operation)] = row.rate

    data = list(data_map.values())

    return columns, data


def get_columns() -> list[dict]:
	"""Return columns for the report.

	One field definition per column, just like a DocType field definition.
	"""
	return [
		{
			"label": _("Column 1"),
			"fieldname": "column_1",
			"fieldtype": "Data",
		},
		{
			"label": _("Column 2"),
			"fieldname": "column_2",
			"fieldtype": "Int",
		},
	]


def get_data() -> list[list]:
	"""Return data for the report.

	The report data is a list of rows, with each row being a list of cell values.
	"""
	return [
		["Row 1", 1],
		["Row 2", 2],
	]
