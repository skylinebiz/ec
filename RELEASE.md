# EC v2.0.0

## Highlights

### Image Tagging Manager

A new way to attach product photos to item variants, built as a submittable document so every change is deliberate and logged.

Pick an Item, search its variants by any combination of Item Attributes (Colour, Size, whatever attributes exist — nothing is hardcoded), and keep the matches you want as a removable list. Upload one or more images, choose at most one as the Primary cover photo (or none, to only attach), and pick how it should apply:

- **Retain** — keep whatever image/attachments the item already has, and add these alongside.
- **Override** — clear the item's existing image and attachments first, then apply only these.

Submitting performs the linking and writes an Applied Log entry for every item touched — `<image> linked with <item> — Success`, or `Failed` with the reason — so there's always a record of exactly what happened and when.

### Item Definition

Item Groups can now carry their own named field labels. Define up to 10 "Def" slots per Item Group (e.g. Def 1 = "Lower", Def 2 = "Fabric" — whatever a group needs), and the Item form relabels those fields live the moment you pick that Item Group. Groups that don't define a slot just fall back to the generic "Def N" label.

### Advanced Item Search fixes

- Style No search now correctly matches against the item's template code instead of doing a loose name match — fewer false positives, and it actually finds the variants you're looking for.
- Barcode now appears before Style No in the search form.

---

## Upgrading

```bash
bench --site <site> migrate
```

No manual data migration is required.
