frappe.ui.form.on("BOM", {
    async refresh(frm) {

        if (frm.is_new() || !frm.doc.item) return;

        const item = frm.doc.item;

        const r = await frappe.call({
            method: "ec.api.bom.get_style_sizes",
            args: { item }
        });

        const data = r.message || {};

        if (frm.doc.item !== item || !(data.sizes || []).length) return;

        frm.add_custom_button(
            __("Style BOM Clone"),
            () => {
                open_style_bom_clone(frm, data);
            }
        );
    }
});

function open_style_bom_clone(frm, data) {

    if (frm.is_dirty()) {
        frappe.throw(__("Please save the BOM before cloning"));
    }

    const d = new frappe.ui.Dialog({
        title: __("Style BOM Clone"),
        size: "large",

        fields: [

            {
                fieldname: "bom",
                label: "BOM",
                fieldtype: "Link",
                options: "BOM",
                default: frm.doc.name,
                read_only: 1
            },

            {
                fieldtype: "Column Break"
            },

            {
                fieldname: "item",
                label: "Item",
                fieldtype: "Link",
                options: "Item",
                default: frm.doc.item,
                read_only: 1
            },

            {
                fieldtype: "Section Break"
            },

            {
                fieldname: "sizes",
                label: "Sizes",
                fieldtype: "Table",
                cannot_add_rows: true,
                cannot_delete_rows: true,
                in_place_edit: true,
                data: data.sizes.map(row => ({
                    item_code: row.item_code,
                    item_name: row.item_name,
                    status: row.default_bom,
                    __checked: row.default_bom ? 0 : 1
                })),
                fields: [
                    {
                        fieldname: "item_name",
                        label: "Item Name",
                        fieldtype: "Data",
                        in_list_view: 1,
                        read_only: 1,
                        columns: 5
                    },
                    {
                        fieldname: "status",
                        label: "Status",
                        fieldtype: "Link",
                        options: "BOM",
                        in_list_view: 1,
                        read_only: 1,
                        columns: 5
                    }
                ]
            }
        ],

        primary_action_label: __("Clone"),

        primary_action: async function () {

            const rows = grid.get_selected_children();

            if (!rows.length) {
                frappe.throw(__("Please select at least one size"));
            }

            const r = await frappe.call({
                method: "ec.api.bom.clone_style_bom",
                args: {
                    bom: frm.doc.name,
                    items: rows.map(row => row.item_code)
                },
                freeze: true,
                freeze_message: __("Cloning BOM...")
            });

            const created = {};

            (r.message || []).forEach(row => {
                created[row.item_code] = row.bom;
            });

            rows.forEach(row => {

                if (!created[row.item_code]) return;

                row.status = created[row.item_code];
                row.__checked = 0;

            });

            refresh_sizes();

            frappe.show_alert({
                message: __("BOMs Created"),
                indicator: "green"
            });
        }
    });

    const grid = d.fields_dict.sizes.grid;

    const refresh_sizes = () => {

        grid.refresh();

        // grid does not set its select all checkbox from the rows
        grid.wrapper
            .find(".grid-heading-row .grid-row-check")
            .prop(
                "checked",
                grid.data.length > 0
                && grid.get_selected_children().length === grid.data.length
            );
    };

    d.show();

    refresh_sizes();
}
