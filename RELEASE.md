# EC v3.0.0

## Highlights

### Added: Return Items dialog for Delivery Note and Purchase Invoice

Both the Delivery Note and Purchase Invoice list views now have a **Return** button that opens a "Return Items" dialog — no need to already know which specific Delivery Note or Purchase Invoice an item came from before starting a return.

The flow is the same for both:

1. Pick the **Customer** (or **Supplier**, for Purchase Invoice) — required first, and gates the rest of the dialog.
2. Build up the list of items to return by **Scan Barcode** (frappe's built-in scanner field — hardware scanner or camera) or **Add Multiple Items** (the same Advanced Item Search used elsewhere in this app: Barcode/Style No/Colour/Colour Code/Size/MRP/WSP/Group Name filters, a qty per row).
3. Choose a **Return Order** — FIFO (default, oldest source document first) or LIFO (newest first).
4. Click **Find Delivery Notes** / **Find Purchase Invoices** — every submitted source document that still has a returnable qty for each requested item is listed, in the chosen order, splitting the requested qty across as many source documents as needed. Items that can't be fully matched stay visible in the table (flagged, light red) instead of silently disappearing.
5. Click **Process All Returns** — matches are grouped by source document first, so multiple items traced back to the *same* Delivery Note or Purchase Invoice become **one** return document, not several. Each return is created and submitted immediately, built on ERPNext's own `make_sales_return()` / `make_debit_note()` mappers, so taxes, transporter/payment info, and every other standard field carry over exactly the way ERPNext's own Sales Return / Debit Note buttons do it.

The dialog can't be closed accidentally (no X, no Esc, no backdrop click — only the explicit Close button) and is fully locked while any return is being processed.

### Fixed: Purchase Invoice returns failing "Received Qty must be equal to Accepted + Rejected Qty"

Returning against a stock-affecting (`update_stock`) Purchase Invoice previously failed with `Row #N: Received Qty must be equal to Accepted + Rejected Qty for Item ...`. `received_qty`/`rejected_qty` are now re-paired to the actual quantity being returned instead of the full original amount.

---

## Upgrading

```bash
bench --site <site> migrate
```

No data migration is required — this release only adds new list-view buttons and API endpoints.

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.
