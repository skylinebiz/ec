frappe.listview_settings["Purchase Invoice"] = {
    onload(listview) {
        listview.page.add_inner_button(
            __("Return"),
            () => {
                ec.utils.open_return_dialog({
                    doctype: "Purchase Invoice",
                    doctype_plural: "Purchase Invoices",
                    route_slug: "purchase-invoice",
                    api_module: "ec.api.purchase_invoice",
                    party_fieldname: "supplier",
                    party_label: "Supplier",
                    party_doctype: "Supplier",
                    doc_fieldname: "purchase_invoice"
                });
            }
        );
    }
};
