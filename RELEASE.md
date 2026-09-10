# EC v2.1.0

## Highlights

### Image Tagging Manager permissions

Role-based access is now enforced:

| Role | Create | Read | Write | Submit |
|---|---|---|---|---|
| Sales User | ✅ | ✅ | ✅ | — |
| Purchase User | ✅ | ✅ | ✅ | — |
| Sales Manager | ✅ | ✅ | ✅ | ✅ |
| Purchase Manager | ✅ | ✅ | ✅ | ✅ |

Users get exactly Create/Read/Write, or Create/Read/Write/Submit — no Cancel, Amend, Delete, or export/print/share access for these roles.

### Fixed: permission error for non-admin roles

Sales and Purchase users could hit `PermissionError: Insufficient Permission for Item Attribute` when using the attribute search on Image Tagging Manager, even with full rights on the document itself. The attribute list was being fetched through Frappe's generic `frappe.client.get_list`, which checks the user's own permissions on whatever doctype is requested — Item Attribute isn't something these roles have direct access to by default. Replaced with a dedicated endpoint that doesn't require it.

---

## Upgrading

```bash
bench --site <site> migrate
```

No manual data migration is required.

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.
