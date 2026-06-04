# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
    columns = [
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 120},
        {
            "label": "Employee",
            "fieldname": "employee",
            "fieldtype": "Data",
            "width": 250,
        },
        {
            "label": "EC Lot",
            "fieldname": "ec_lot",
            "fieldtype": "Link",
            "options": "EC Lot",
            "width": 150,
        },
        {
            "label": "Item",
            "fieldname": "item",
            "fieldtype": "Link",
            "options": "Item",
            "width": 180,
        },
        {
            "label": "Operation",
            "fieldname": "operation",
            "fieldtype": "Link",
            "options": "Operation",
            "width": 150,
        },
        {"label": "Qty", "fieldname": "qty", "fieldtype": "Float", "width": 100},
        {"label": "Rate", "fieldname": "rate", "fieldtype": "Currency", "width": 120},
        {
            "label": "Amount",
            "fieldname": "amount",
            "fieldtype": "Currency",
            "width": 120,
        },
    ]

    conditions = []
    values = {}

    if filters.get("from_date"):
        conditions.append("pl.date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("pl.date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    employees = filters.get("employee") or []

    if employees:
        conditions.append("emp.name IN %(employees)s")
        values["employees"] = tuple(employees)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    data = frappe.db.sql(
        f"""
        SELECT
            pl.date AS date,
            CONCAT(pli.employee, ': ', emp.employee_name) AS employee,
            pli.ec_lot AS ec_lot,
            pli.item AS item,
            pli.operation AS operation,
            pli.qty AS qty,
            pli.rate AS rate,
            pli.amount AS amount
        FROM `tabEC Process Lot Item` pli
        INNER JOIN `tabEC Process Lot` pl
            ON pl.name = pli.parent
        LEFT JOIN `tabEmployee` emp
            ON emp.name = pli.employee
        {where_clause}
        ORDER BY
            pl.date DESC,
            emp.employee_name
        """,
        values,
        as_dict=True,
    )

    return columns, data
