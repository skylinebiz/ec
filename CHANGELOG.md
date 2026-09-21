# Changelog

All notable changes to the EC app are documented in this file.

## [3.1.0] - 2026-09-21

### Added

- **Purchase Receipt Return** — a "Return" button on the Purchase Receipt list view opens the same "Return Items" dialog as Delivery Note and Purchase Invoice (Supplier picked first, Scan Barcode / Add Multiple Items, FIFO/LIFO Return Order, Find Purchase Receipts, Process All Returns). Matches are grouped by source Purchase Receipt and one return Purchase Receipt is created and submitted per source document, built on ERPNext's own `make_purchase_return()`, so taxes and every other standard field carry over the same way ERPNext's own Return button does it. Accepted/Rejected qty is always re-paired to the quantity actually being returned (the full returned qty is treated as accepted), since Purchase Receipt enforces that check unconditionally.

### Changed

- **Return dialogs (Delivery Note, Purchase Invoice, Purchase Receipt)** — Scan Barcode now calls ERPNext's native `erpnext.stock.utils.scan_barcode` directly instead of an EC wrapper endpoint. A scan that matches nothing (or matches a warehouse rather than an item) shows a "Cannot find Item with this Barcode" alert, and scanned rows show the item code rather than the item name, since ERPNext's scan result doesn't include one.

## [3.0.0] - 2026-09-14

### Added

- **Delivery Note Return** — a "Return" button on the Delivery Note list view opens a "Return Items" dialog for returning items without knowing which Delivery Note they were delivered on:
  - **Customer** is picked first and gates Scan Barcode / Add Multiple Items until set.
  - **Scan Barcode** — frappe's built-in barcode field (hardware scanner input or the camera-based scan button).
  - **Add Multiple Items** — the same Advanced Item Search UI used on transaction item grids elsewhere in this app (Barcode/Style No/Colour/Colour Code/Size/MRP/WSP/Group Name filters, a qty per row), populating straight into the dialog's own item list instead of a form grid.
  - **Return Order** — FIFO (default, oldest Delivery Note first) or LIFO (newest first).
  - **Find Delivery Notes** lists every submitted Delivery Note that still has a returnable qty for each requested item, in FIFO/LIFO order — splitting the requested qty across as many source Delivery Notes as needed to cover it. Items with no (or insufficient) returnable qty stay visible as their own flagged row instead of silently disappearing.
  - **Process All Returns** groups matches by source Delivery Note and creates + submits **one** return Delivery Note per source document — several items returned from the same Delivery Note land on a single return, not several. Built on ERPNext's own `make_sales_return()`, so taxes, transporter info, sales team, and every other standard field carry over the same way ERPNext's own Sales Return does it.
  - The dialog cannot be dismissed via the X button, Esc, or clicking outside — only the explicit Close button — and is fully blocked while a return is being processed.
- **Purchase Invoice Return** — the identical dialog and flow on the Purchase Invoice list view, for returning purchased items to a supplier as a Debit Note, built on ERPNext's own `make_debit_note()`.
- Both list views' Return dialogs are driven by one shared implementation (`ec.utils.open_return_dialog`), differing only by a small per-doctype configuration.

### Fixed

- **Purchase Invoice Return** — returning against a stock-affecting (`update_stock`) Purchase Invoice no longer fails with "Received Qty must be equal to Accepted + Rejected Qty for Item ..."; `received_qty`/`rejected_qty` are now re-paired to the actual quantity being returned.

## [2.2.0] - 2026-09-11

### Fixed

- **Item Definition** — the Item form's "Definitions" section (`custom_def_1`–`custom_def_10`) was anchored right after Item Group. It's now anchored after the core "Item Attributes" section instead, a spot no other installed app targets, so it renders in a fixed, predictable place regardless of what other apps customize on Item.

## [2.1.0] - 2026-09-10

### Added

- **Image Tagging Manager** — role-based permissions: `Sales User` and `Purchase User` can Create, Read, and Write; `Sales Manager` and `Purchase Manager` additionally get Submit. No Cancel, Amend, Delete, Print, Export, Email, Share, or Report access for any of the four.

### Fixed

- **Image Tagging Manager** — fixed `PermissionError: Insufficient Permission for Item Attribute` for users without direct access to the Item Attribute doctype (e.g. Sales/Purchase User and Manager). The attribute-search UI was calling Frappe's generic `frappe.client.get_list`, which enforces the calling user's own doctype permissions; replaced with a dedicated backend endpoint so using Image Tagging Manager no longer requires separate rights on Item Attribute.

## [2.0.0] - 2026-09-09

### Added

- **Image Tagging Manager** — new submittable doctype for linking catalogue photos to item variants:
  - Search item variants by any combination of Item Attributes (dynamic — works for however many attributes exist, no hardcoded fields).
  - Upload one or more images, mark at most one as Primary (becomes the item's cover image) or none at all — the rest are attached to the item.
  - **Retain** (keep the item's existing image/attachments and add these alongside) or **Override** (remove existing image and attachments first, then apply only these) modes.
  - Submitting runs the linking, and appends a per-item Linked/Unlinked, Success/Failed entry to an Applied Log — a durable, queryable audit trail of every change made.
  - Auto-named with a date-based series (`ITM-DD-MM-YYYY-#####`).
- **Item Definition** — new doctype defining up to 10 named "Def" slots per Item Group. On the Item form, selecting an Item Group dynamically relabels the corresponding fields on the Item (e.g. "Def 1" becomes "Lower") using that group's definitions, falling back to the default label when a slot isn't defined for the group.

### Fixed

- **Advanced Item Search** — Style No search now matches against the item's template (`variant_of`) instead of `item_name`, so it correctly finds variants under a style rather than relying on a name substring match.
- **Advanced Item Search** — reordered search fields so Barcode appears before Style No.

## [1.0.0] - 2026-09-07

- Initial release.
