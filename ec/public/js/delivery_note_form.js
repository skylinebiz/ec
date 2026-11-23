frappe.ui.form.on("Delivery Note", {

    refresh(frm) {

        if (frm.doc.docstatus !== 0 || frm.doc.is_return) {
            return;
        }

        frm.add_custom_button(
            __("Link Pick List"),
            () => link_pick_lists(frm)
        );
    }
});

// Link the rows of a Delivery Note made by hand to what the customer's
// open Pick Lists picked, so the Pick Lists (and Ordered Dispatch) see
// them delivered on submit. A row is split when it spans Pick List rows
// or has more than they picked; the rest stays unlinked.
async function link_pick_lists(frm) {

    if (!frm.doc.customer) {
        frappe.msgprint(__("Select a Customer first."));
        return;
    }

    const r = await frappe.call({
        method: "ec.api.delivery_note_pick_list.get_pick_list_allocation",

        args: {
            delivery_note: frm.doc.name,
            customer: frm.doc.customer,
            company: frm.doc.company,
            items: (frm.doc.items || []).map(row => ({
                name: row.name,
                item_code: row.item_code,
                stock_qty: flt(row.qty) * (flt(row.conversion_factor) || 1),
                so_detail: row.so_detail,
                against_pick_list: row.against_pick_list,
                pick_list_item: row.pick_list_item,
                serial_and_batch_bundle: row.serial_and_batch_bundle,
                batch_no: row.batch_no,
                serial_no: row.serial_no
            }))
        },

        freeze: true,
        freeze_message: __("Matching open Pick Lists...")
    });

    const allocation = r.message || {};

    // last row first, so rows inserted below one do not move the ones still to do
    const rows = (frm.doc.items || [])
        .filter(row => allocation[row.name])
        .sort((a, b) => b.idx - a.idx);

    if (!rows.length) {
        frappe.msgprint(__("No open Pick List has anything left to deliver for these items."));
        return;
    }

    const pick_lists = new Set();
    const grid = frm.fields_dict.items.grid;

    for (const row of rows) {

        const conversion_factor = flt(row.conversion_factor) || 1;
        const lines = allocation[row.name];

        const linked_qty = lines.reduce((total, line) => total + flt(line.stock_qty), 0);
        const remaining = flt(row.qty) * conversion_factor - linked_qty;

        // whatever no Pick List row covers stays on the original row, unlinked
        let targets = lines.map(() => null);

        if (remaining > 0) {
            await frappe.model.set_value(row.doctype, row.name, "qty", remaining / conversion_factor);
        } else {
            targets[0] = row;
        }

        for (let i = lines.length - 1; i >= 0; i--) {

            const line = lines[i];
            const target = targets[i] || grid.add_new_row(row.idx + 1, null, false, row);

            await frappe.model.set_value(target.doctype, target.name, {
                against_pick_list: line.pick_list,
                pick_list_item: line.pick_list_item,
                warehouse: line.warehouse,
                against_sales_order: line.sales_order || "",
                so_detail: line.so_detail || ""
            });

            await frappe.model.set_value(
                target.doctype,
                target.name,
                "qty",
                flt(line.stock_qty) / conversion_factor
            );

            pick_lists.add(line.pick_list);
        }
    }

    frm.refresh_field("items");

    frappe.show_alert({
        message: __("Linked to {0}", [Array.from(pick_lists).join(", ")]),
        indicator: "green"
    });
}
