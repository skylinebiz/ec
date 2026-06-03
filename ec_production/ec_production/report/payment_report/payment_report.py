# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {
            "label": _("Employee"),
            "fieldname": "employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 250,
        },
        {
            "label": _("Final Amount"),
            "fieldname": "final_amount",
            "fieldtype": "Currency",
            "width": 150,
        },
    ]


def get_data(filters):
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")

    process_lots = frappe.get_all(
        "EC Process Lot",
        filters={
            "date": ["between", [from_date, to_date]]
        },
        fields=["name"]
    )

    if not process_lots:
        return []

    lot_names = [d.name for d in process_lots]

    lot_items = frappe.get_all(
        "EC Process Lot Item",
        filters={
            "parent": ["in", lot_names]
        },
        fields=[
            "employee",
            "amount"
        ]
    )
    
    employee_names = {
		e.name: e.employee_name
		for e in frappe.get_all(
			"Employee",
			fields=["name", "employee_name"]
		)
	}

    employee_totals = {}

    for row in lot_items:
        if not row.employee:
            continue

        employee_totals.setdefault(row.employee, 0)
        employee_totals[row.employee] += row.amount or 0

    data = []

    for employee, total in sorted(employee_totals.items()):
        data.append({
            "employee": employee_names.get(employee, employee),
            "final_amount": total
        })

    return data