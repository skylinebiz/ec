# Changelog

All notable changes to the EC app are documented in this file.

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
