frappe.ui.form.on("Item", {

    refresh(frm) {
        set_item_definition_labels(frm);
    },

    item_group(frm) {
        set_item_definition_labels(frm);
    }
});

function set_item_definition_labels(frm) {

    if (!frm.doc.item_group) {

        reset_item_definition_labels(frm);

        return;
    }

    frappe.call({
        method: "ec.api.item.get_item_definition",

        args: {
            item_group: frm.doc.item_group
        },

        callback(r) {

            const data = r.message || {};

            for (let i = 1; i <= 10; i++) {

                const fieldname = `custom_def_${i}`;

                const label = data[`def_${i}`]
                    || __("Def {0}", [i]);

                frm.set_df_property(
                    fieldname,
                    "label",
                    label
                );
            }

            frm.refresh_fields();
        }
    });
}

function reset_item_definition_labels(frm) {

    for (let i = 1; i <= 10; i++) {

        frm.set_df_property(
            `custom_def_${i}`,
            "label",
            __("Def {0}", [i])
        );
    }

    frm.refresh_fields();
}
