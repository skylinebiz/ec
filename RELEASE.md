# EC v2.2.0

## Highlights

### Fixed: Item Definition section position now stable across app installs

The "Definitions" section on the Item form (`custom_def_1`–`custom_def_10`, dynamically relabeled per Item Group by Item Definition) was anchored right after the **Item Group** field. That's also where other apps anchor their own Item customizations — India Compliance, for example, inserts its HSN/SAC field there too — so whenever such an app was installed or the site was migrated, the two competed for the same position and the Definitions section (and the fields around it) could end up reordered.

It's now anchored right after the core **Item Attributes** section instead, a position nothing else in this bench targets, so it renders in the same place regardless of what other apps customize on Item.

---

## Upgrading

```bash
bench --site <site> migrate
```

If the Definitions section doesn't move on a site where fields were previously drag-reordered in Customize Form, check for a leftover `field_order` Property Setter on Item — it pins one frozen order ahead of any field's individual `insert_after` and needs to be cleared for the new position to take effect:

```python
frappe.db.exists("Property Setter", {"doc_type": "Item", "property": "field_order"})
# if found:
frappe.delete_doc("Property Setter", <name>)
frappe.clear_cache(doctype="Item")
```

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.
