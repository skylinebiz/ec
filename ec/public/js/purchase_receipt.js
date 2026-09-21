frappe.listview_settings["Purchase Receipt"] = {
    onload(listview) {
        listview.page.add_inner_button(
            __("Return"),
            () => {
                ec.utils.open_return_dialog({
                    doctype: "Purchase Receipt",
                    doctype_plural: "Purchase Receipts",
                    route_slug: "purchase-receipt",
                    api_module: "ec.api.purchase_receipt",
                    party_fieldname: "supplier",
                    party_label: "Supplier",
                    party_doctype: "Supplier",
                    doc_fieldname: "purchase_receipt"
                });
            }
        );
    }
};
