# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _


class ECProcessLot(Document):
	def validate(self):

		# for row in self.lot_items:
		# 	row.process_lot_date = self.date


		self.total_qty = 0
		self.total_amount = 0

		assigned = {}

		for row in self.lot_items:

			row.qty = flt(row.qty)
			row.rate = flt(row.rate)

			row.amount = row.qty * row.rate

			self.total_qty += row.qty
			self.total_amount += row.amount

			if not (row.ec_lot and row.item and row.operation):
				continue

			key = (
				row.ec_lot,
				row.item,
				row.operation
			)

			assigned[key] = assigned.get(key, 0) + row.qty

		for (ec_lot, item, operation), assigned_qty in assigned.items():

				processed_rows = frappe.get_all(
					"EC Process Lot Item",
					filters={
						"ec_lot": ec_lot,
						"item": item,
						"operation": operation,
						"parent": ["!=", self.name]
					},
					fields=["qty"]
				)

				processed_qty = sum(flt(row.qty) for row in processed_rows)

				allowed_qty = frappe.db.get_value(
					"EC Lot Item",
					{
						"parent": ec_lot,
						"item": item,
						"operation": operation
					},
					"qty"
				) or 0

				available_qty = flt(allowed_qty) - processed_qty

				if assigned_qty > available_qty:

					frappe.throw(_(
						"Item <b>{0}</b> / Operation <b>{1}</b><br>"
						"Already Processed: <b>{2}</b><br>"
						"Trying to Process: <b>{3}</b><br>"
						"Available Qty: <b>{4}</b>"
					).format(
						item,
						operation,
						processed_qty,
						assigned_qty,
						available_qty
					))
