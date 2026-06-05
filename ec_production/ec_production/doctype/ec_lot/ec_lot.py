# Copyright (c) 2026, SkylineBiz Private Limited and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _


class ECLot(Document):

	def validate(self):

		if self.is_new():
			return

		old_doc = self.get_doc_before_save()
		if not old_doc:
			return

		if old_doc.ec_lot_item != self.ec_lot_item:
			submitted_lots = frappe.get_all(
				"EC Process Lot",
				filters={"docstatus": 1},
				pluck="name"
			)

			if submitted_lots:
				process_lot = frappe.db.get_value(
					"EC Process Lot Item",
					{
						"ec_lot": self.name,
						"parent": ["in", submitted_lots]
					},
					"parent"
				)

				if process_lot:
					frappe.throw(
						_(
							"Submitted Process Lot <a href='/app/ec-process-lot/{0}'>{0}</a> "
							"exists against this EC Lot. Cancel the Process Lot before modifying this Lot."
						).format(process_lot)
					)
				
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


def get_dashboard_data():
    return {
        "transactions": [
            {
                "label": "References",
                "items": ["EC Process Lot"]
            }
        ]
    }