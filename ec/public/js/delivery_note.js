frappe.listview_settings["Delivery Note"] = {
    onload(listview) {
        listview.page.add_inner_button(
            __("Return"),
            () => {
                ec.utils.open_return_dialog({
                    doctype: "Delivery Note",
                    doctype_plural: "Delivery Notes",
                    route_slug: "delivery-note",
                    api_module: "ec.api.delivery_note",
                    party_fieldname: "customer",
                    party_label: "Customer",
                    party_doctype: "Customer",
                    doc_fieldname: "delivery_note"
                });
            }
        );
    }
};
