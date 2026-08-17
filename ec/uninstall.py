import frappe


def before_uninstall():
    module = "EC"

    custom_fields = frappe.get_all(
        "Custom Field",
        filters={"module": module},
        fields=["name", "dt", "fieldname"],
    )

    for cf in custom_fields:
        # Delete the Custom Field
        frappe.delete_doc(
            "Custom Field",
            cf.name,
            ignore_permissions=True,
            force=True,
        )
        
    frappe.clear_cache()