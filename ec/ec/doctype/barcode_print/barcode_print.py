# Copyright (c) 2026, harshit@skylinebiz.in and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.query_builder import Interval
from frappe.query_builder.functions import Now
from frappe.utils import cint, flt

from ec.api.barcode_print import get_label_details


class BarcodePrint(Document):
	def validate(self):
		self.set_prices()
		self.set_missing_item_details()
		self.total_labels = sum(cint(row.qty) for row in self.items)

	def set_prices(self):
		# Changing the Price List re-prices every row from the new list
		if self.is_new() or not self.has_value_changed("price_list"):
			return

		rows = [row for row in self.items if row.item_code]
		details = get_label_details([row.item_code for row in rows], self.price_list)

		for row in rows:
			row.mrp = details.get(row.item_code, {}).get("mrp", 0)

	def set_missing_item_details(self):
		rows = [
			row for row in self.items
			if row.item_code and (not row.barcode or not flt(row.mrp))
		]
		if not rows:
			return

		details = get_label_details([row.item_code for row in rows], self.price_list)

		for row in rows:
			for fieldname, value in details.get(row.item_code, {}).items():
				if not row.get(fieldname):
					row.set(fieldname, value)

	@staticmethod
	def clear_old_logs(days=30):
		# Called by Log Settings: removes entries older than the configured days
		parent = frappe.qb.DocType("Barcode Print")
		child = frappe.qb.DocType("Barcode Print Item")
		cutoff = Now() - Interval(days=days)

		old_entries = frappe.qb.from_(parent).select(parent.name).where(parent.creation < cutoff)

		frappe.qb.from_(child).delete().where(child.parent.isin(old_entries)).run()
		frappe.qb.from_(parent).delete().where(parent.creation < cutoff).run()
