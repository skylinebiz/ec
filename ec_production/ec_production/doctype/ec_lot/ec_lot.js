// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("EC Lot Item", {
    item: fetch_rate,
    operation: fetch_rate,
    date: fetch_rate,

    qty(frm) {
        update_total_qty(frm);
    }
});

frappe.ui.form.on("EC Lot Item", {
    ec_lot_item_remove(frm) {

        setTimeout(() => {
            update_total_qty(frm);
        }, 100);

    }
});

frappe.ui.form.on("EC Lot", {

    refresh(frm) {
        update_total_qty(frm);
    },

    validate(frm) {
        update_total_qty(frm);
    }

});

function update_total_qty(frm) {

    let total_qty = 0;

    (frm.doc.ec_lot_item || []).forEach(row => {
        total_qty += flt(row.qty);
    });

    frm.set_value("total_qty", total_qty);
}

function fetch_rate(frm, cdt, cdn) {

    const row = locals[cdt][cdn];

    if (!(row.item && row.operation && row.date)) {
        return;
    }

    frappe.call({
        method: "ec_production.ec_production.doctype.ec_lot.ec_lot.get_rate",
        args: {
            item: row.item,
            operation: row.operation,
            date: row.date
        },
        callback: ({ message }) => {
            frappe.model.set_value(
                cdt,
                cdn,
                "rate",
                flt(message)
            );
        }
    });
}