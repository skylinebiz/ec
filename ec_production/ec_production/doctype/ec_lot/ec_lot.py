# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class ECLot(Document):

	def validate(self):

		self.total_qty = sum(
			flt(row.qty)
			for row in self.ec_lot_item
		)

		for row in self.ec_lot_item:

			if row.item and row.operation and row.date and not row.rate:
				row.rate = get_rate(
					row.item,
					row.operation,
					row.date
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
