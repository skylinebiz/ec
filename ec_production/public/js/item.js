frappe.ui.form.on("Item", {
    refresh(frm) {

        if (!frm.doc.has_variants) return;

        frm.add_custom_button(__("Style Creator"), () => {

            const dialog = new frappe.ui.Dialog({
                title: __("Style Creator"),
                size: "large",
                fields: [
                    {
                        label: __("MRP"),
                        fieldname: "mrp",
                        fieldtype: "Currency",
                        reqd: 1
                    },
                    {
                        label: __("WSP"),
                        fieldname: "wsp",
                        fieldtype: "Currency",
                        reqd: 1
                    },
                    {
                        label: __("Sizes"),
                        fieldname: "sizes",
                        fieldtype: "Small Text",
                        description: __("Comma separated. Example: S,M,L,XL")
                    },
                    {
                        label: __("Colors"),
                        fieldname: "colors",
                        fieldtype: "Small Text",
                        description: __("Comma separated. Example: Red,Blue,Black")
                    }
                ],

                primary_action_label: __("Create Variants"),

                // primary_action(values) {

                //     frappe.call({
                //         method: "your_app.api.item.create_style_variants",

                //         args: {
                //             template: frm.doc.name,
                //             mrp: values.mrp,
                //             wsp: values.wsp,
                //             sizes: values.sizes,
                //             colors: values.colors
                //         },

                //         freeze: true,
                //         freeze_message: __("Creating Variants..."),

                //         callback(r) {

                //             if (!r.exc) {

                //                 frappe.msgprint(
                //                     __("Variants created successfully")
                //                 );

                //                 dialog.hide();

                //                 frm.reload_doc();
                //             }
                //         }
                //     });
                // }
            });

            dialog.show();
        }, __("Create"));
    }
});