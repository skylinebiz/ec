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
