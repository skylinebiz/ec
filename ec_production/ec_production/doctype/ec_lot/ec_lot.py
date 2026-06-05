# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _


class ECLot(Document):

	def validate(self):
		self.set_rates()
		self.validate_used_qty()
		self.calculate_totals()

	def set_rates(self):
		for row in self.ec_lot_item:
			if row.item and row.operation and row.date and not row.rate:
				row.rate = get_rate(
					row.item,
					row.operation,
					row.date
				)

	def calculate_totals(self):
		self.total_qty = sum(
			flt(row.qty)
			for row in self.ec_lot_item
		)

	def validate_used_qty(self):
		"""
		If this lot has already been used in any Process Lot
		(draft/submitted/cancelled), do not allow reducing qty
		below the quantity already consumed.
		"""

		if self.is_new():
			return

		for row in self.ec_lot_item:

			used_qty = frappe.db.sql("""
				SELECT COALESCE(SUM(qty), 0)
				FROM `tabEC Process Lot Item`
				WHERE ec_lot = %s
				  AND item = %s
				  AND operation = %s
			""", (
				self.name,
				row.item,
				row.operation
			))[0][0] or 0

			if flt(row.qty) < flt(used_qty):
				frappe.throw(
					_(
						"Cannot reduce Qty for Item <b>{item}</b> ({operation}).<br><br>"
						"Qty in EC Lot: <b>{lot_qty}</b><br>"
						"Qty already used in Process Lots: <b>{used_qty}</b><br><br>"
						"Qty must be at least <b>{used_qty}</b>."
					).format(
						item=row.item,
						operation=row.operation,
						lot_qty=row.qty,
						used_qty=used_qty
					)
				)


@frappe.whitelist()
def get_rate(item, operation, date):

    rate = frappe.db.get_value(
        "EC Item Operation Rate",
        {
            "item": item,
            "operation": operation,
            "effective_from": ["<=", date]
        },
        "rate",
        order_by="effective_from desc"
    )

    return flt(rate)


def get_dashboard_data():
    return {
        "transactions": [
            {
                "label": "References",
                "items": ["EC Process Lot"]
            }
        ]
    }