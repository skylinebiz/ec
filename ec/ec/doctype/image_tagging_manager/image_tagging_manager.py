# Copyright (c) 2026, harshit@skylinebiz.in and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from ec.api.item_catalogue import ensure_tagging_manager_folder, IMAGE_EXTENSIONS


class ImageTaggingManager(Document):

	def validate(self):

		primaries = [d for d in self.images if d.is_primary]

		if len(primaries) > 1:
			frappe.throw(_("Only one image can be marked as Primary"))

	def before_submit(self):

		if not self.matched_items:
			frappe.throw(_("Search and keep at least one matching item variant"))

		if not self.images:
			frappe.throw(_("Upload at least one image"))

	def on_submit(self):

		item_codes = [d.item_code for d in self.matched_items]

		folder = ensure_tagging_manager_folder()

		primary_row = next((d for d in self.images if d.is_primary), None)
		secondary_rows = [d for d in self.images if not d.is_primary]

		primary_url = primary_row.image if primary_row else None
		secondary_urls = [d.image for d in secondary_rows]

		log_entries = []

		def log(item_code, file_url, action, status, remarks=""):
			log_entries.append({
				"item_code": item_code,
				"file_url": file_url,
				"action": action,
				"status": status,
				"remarks": remarks
			})

		for item_code in item_codes:

			try:
				if not frappe.db.exists("Item", item_code):
					frappe.throw(_("Item {0} does not exist").format(item_code))

				if self.mode == "Override":

					if primary_url:

						previous = frappe.db.get_value("Item", item_code, "image")

						if previous:
							log(item_code, previous, "Unlinked", "Success")

						frappe.db.set_value("Item", item_code, "image", None)

					# Remove every existing *image* attachment on this
					# item, regardless of folder.
					existing = frappe.get_all(
						"File",
						filters={
							"attached_to_doctype": "Item",
							"attached_to_name": item_code
						},
						fields=["name", "file_url"]
					)

					for f in existing:

						ext = (f.file_url or "").rsplit(".", 1)[-1].lower()

						if ext in IMAGE_EXTENSIONS:
							frappe.delete_doc(
								"File",
								f.name,
								ignore_permissions=True
							)
							log(item_code, f.file_url, "Unlinked", "Success")

				current_image = frappe.db.get_value("Item", item_code, "image")

				item_secondary_urls = list(secondary_urls)

				if primary_url:

					if (
						self.mode == "Retain"
						and current_image
						and current_image != primary_url
						and current_image not in item_secondary_urls
					):
						# Don't lose the item's current cover photo
						# just because a new one was picked - keep it
						# around as an attachment instead of
						# discarding it.
						item_secondary_urls.append(current_image)

					frappe.db.set_value(
						"Item",
						item_code,
						"image",
						primary_url
					)

					log(item_code, primary_url, "Linked", "Success")

				for file_url in item_secondary_urls:

					if frappe.db.exists(
						"File",
						{
							"file_url": file_url,
							"attached_to_doctype": "Item",
							"attached_to_name": item_code
						}
					):
						continue

					frappe.get_doc({
						"doctype": "File",
						"file_url": file_url,
						"attached_to_doctype": "Item",
						"attached_to_name": item_code,
						"folder": folder,
						"is_private": 0
					}).insert(ignore_permissions=True)

					log(item_code, file_url, "Linked", "Success")

			except Exception as e:

				log(
					item_code,
					primary_url or "",
					"Linked",
					"Failed",
					remarks=str(e)
				)

				frappe.log_error(
					title="Image Tagging Manager - on_submit",
					message=frappe.get_traceback()
				)

		for entry in log_entries:
			self.append("log", entry)

		self.update_child_table("log")
