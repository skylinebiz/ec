### EC

Custom Frappe/ERPNext app for apparel/style-based item management, image tagging, and delivery workflow extensions.

### Features

#### Style Creator

From the Item list view ("Style Creator" button), bulk-create a style template plus every Colour × Colour Code × Size variant in one go, with MRP/WSP set per row and a barcode generated for each variant.

#### Advanced Item Search

Available as "Advanced Search" and "Item Visualizer" buttons on the items grid of Sales Order, Quotation, Sales Invoice, Delivery Note, Purchase Order, Purchase Receipt, and Production Plan:

- **Advanced Search** — search items by Barcode, Style No (matches the item's template), Colour, Colour Code, Size, MRP, WSP, or Item Group, then populate matching rows straight into the document with quantities.
- **Item Visualizer** — see the items already on the document grouped by Style/Colour/Colour Code, broken down by size, with grand totals.

#### Item Definition

Define up to 10 named "Def" slots per Item Group (e.g. Def 1 = "Lower", Def 2 = "Fabric"). On the Item form, selecting an Item Group relabels the corresponding fields live using that group's definitions, falling back to the generic "Def N" label when a slot isn't defined.

#### Image Tagging Manager

A submittable doctype for linking catalogue photos to item variants:

- Search item variants by any combination of Item Attributes (fully dynamic — works for however many attributes exist).
- Upload one or more images; mark at most one as Primary (becomes the item's cover image) or none at all (the rest are just attached).
- **Retain** (keep the item's existing image/attachments and add these alongside) or **Override** (remove the existing image and attachments first, then apply only these).
- Submitting performs the linking and writes a per-item Linked/Unlinked, Success/Failed entry to an Applied Log — a durable, queryable audit trail.
- Auto-named with a date-based series (`ITM-DD-MM-YYYY-#####`).

#### Delivery Note Type

A "Type" field on Delivery Note (Adhoc / Against (FIFO) / Against (LIFO)) that:

- **Adhoc** — blocks saving if any row still references a Sales Order.
- **Against (FIFO) / (LIFO)** — groups rows by item, then auto-splits and allocates each item's total quantity against pending Sales Orders in oldest-first (FIFO) or newest-first (LIFO) order, throwing a clear error if there isn't enough pending Sales Order quantity to cover it.

#### Delivery Note Return

A "Return" button on the Delivery Note list view opens a dialog for returning items without needing to know which Delivery Note they were delivered on:

- **Customer** — picked first; gates Scan Barcode/Add Multiple Items until set, and scopes the Delivery Note search below to that customer only.
- **Scan Barcode** — frappe's built-in barcode scanner field (hardware scanner input or the camera-based scan button) adds/increments items in the "items to return" list.
- **Add Multiple Items** — the same Advanced Item Search UI used on transaction item grids elsewhere in this app (Barcode/Style No/Colour/Colour Code/Size/MRP/WSP/Group Name filters, a results table with a qty per row) — Populate adds the entered rows into "Items to Return" instead of a form grid.
- **Return Order** — FIFO (default, oldest Delivery Note first) or LIFO (newest first).
- **Find Delivery Notes** lists every submitted Delivery Note that still has a returnable qty for each requested item (net of anything already returned), in FIFO/LIFO order — not just the minimum needed — showing each row's own returnable qty alongside an editable, pre-split suggested qty.
- **Process All Returns** groups the result rows by source Delivery Note first, then creates and submits ONE return Delivery Note per source Delivery Note — if two different items both trace back to the same Delivery Note, they land on a single return with two rows, not two separate returns; a different source Delivery Note always gets its own return. Each return carries `is_return`/`return_against`/negative qty, with taxes/transporter/sales team and every other standard field carried over the same way ERPNext's own Sales Return does it. The dialog can't be closed while returns are being processed.

#### Purchase Invoice Return

The same "Return" dialog, on the Purchase Invoice list view, for returning purchased items to a supplier without knowing which Purchase Invoice they came in on — identical flow and identical grouping rule (Supplier picked first / Scan Barcode / Add Multiple Items via Advanced Item Search / FIFO-LIFO Return Order / Find Purchase Invoices / Process All Returns creates one debit note per source Purchase Invoice, combining multiple items from the same one), built on ERPNext's own Debit Note mapping (`make_debit_note`) instead of Sales Return.

#### Production Plan quick-populate

Backing API used by Advanced Search to add items into a Production Plan's Material Request Plan, auto-filling the default active BOM, stock UOM, and description per item, and merging quantities into an existing row instead of duplicating it.

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch main
bench install-app ec
```

### Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history, and [RELEASE.md](./RELEASE.md) for the latest release notes.

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/ec
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
