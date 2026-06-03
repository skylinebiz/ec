// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on("EC Process Lot", {

    setup(frm) {

        frm.set_query("item", "lot_items", function (doc, cdt, cdn) {

            const row = locals[cdt][cdn];

            return {
                filters: {
                    name: ["in", row.allowed_items || [""]]
                }
            };
        });

        frm.set_query("operation", "lot_items", function (doc, cdt, cdn) {

            const row = locals[cdt][cdn];

            return {
                filters: {
                    name: ["in", row.allowed_operations || [""]]
                }
            };
        });
    },

    refresh(frm) {
        update_totals(frm);
    },

    lot_items_remove(frm) {
        update_totals(frm);
    },

    async validate(frm) {

        update_totals(frm);
        await validate_assigned_qty(frm);

    }
});


function calculate_amount(cdt, cdn) {

    const row = locals[cdt][cdn];

    frappe.model.set_value(
        cdt,
        cdn,
        "amount",
        flt(row.qty) * flt(row.rate)
    );
}


function update_totals(frm) {

    let total_qty = 0;
    let total_amount = 0;

    (frm.doc.lot_items || []).forEach(row => {

        total_qty += flt(row.qty);
        total_amount += flt(row.amount);

    });

    frm.set_value("total_qty", total_qty);
    frm.set_value("total_amount", total_amount);
}


function populate_row(cdt, cdn, data) {

    frappe.model.set_value(cdt, cdn, "operation", data.operation);
    frappe.model.set_value(cdt, cdn, "qty", data.qty);
    frappe.model.set_value(cdt, cdn, "rate", data.rate);

    setTimeout(() => {

        const row = locals[cdt][cdn];

        frappe.model.set_value(
            cdt,
            cdn,
            "amount",
            flt(row.qty) * flt(row.rate)
        );

    }, 50);
}


async function validate_assigned_qty(frm) {

    let assigned = {};

    (frm.doc.lot_items || []).forEach(row => {

        if (!row.ec_lot || !row.item || !row.operation) {
            return;
        }

        const key = `${row.ec_lot}||${row.item}||${row.operation}`;

        assigned[key] = (assigned[key] || 0) + flt(row.qty);
    });

    for (const key in assigned) {

        const [ec_lot, item, operation] = key.split("||");

        const lot = await frappe.db.get_doc("EC Lot", ec_lot);

        const source = (lot.ec_lot_item || []).find(
            d =>
                d.item === item &&
                d.operation === operation
        );

        if (!source) {
            continue;
        }

        if (assigned[key] > flt(source.qty)) {

            frappe.throw(
                `${item} / ${operation}: Assigned Qty ${assigned[key]} exceeds Available Qty ${source.qty}`
            );
        }
    }
}


frappe.ui.form.on("EC Process Lot Item", {

    ec_lot(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!row.ec_lot) {
            return;
        }

        frappe.db.get_doc("EC Lot", row.ec_lot).then(doc => {

            row.lot_data = doc.ec_lot_item || [];

            row.allowed_items = [
                ...new Set(
                    row.lot_data.map(d => d.item)
                )
            ];

            row.allowed_operations = [];

            frm.refresh_field("lot_items");
        });
    },

    item(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!row.lot_data || !row.item) {
            return;
        }

        const matches = row.lot_data.filter(
            d => d.item === row.item
        );

        row.allowed_operations = [
            ...new Set(
                matches.map(d => d.operation)
            )
        ];

        frappe.model.set_value(cdt, cdn, "operation", "");
        frappe.model.set_value(cdt, cdn, "qty", "");
        frappe.model.set_value(cdt, cdn, "rate", "");
        frappe.model.set_value(cdt, cdn, "amount", "");

        if (matches.length === 1) {
            populate_row(cdt, cdn, matches[0]);
        }

        frm.refresh_field("lot_items");
    },

    operation(frm, cdt, cdn) {

        const row = locals[cdt][cdn];

        if (!row.lot_data || !row.item || !row.operation) {
            return;
        }

        const match = row.lot_data.find(
            d =>
                d.item === row.item &&
                d.operation === row.operation
        );

        if (match) {
            populate_row(cdt, cdn, match);
        }

        update_totals(frm);
    },

    qty(frm, cdt, cdn) {

        calculate_amount(cdt, cdn);

        setTimeout(() => {
            update_totals(frm);
        }, 50);
    },

    rate(frm, cdt, cdn) {

        calculate_amount(cdt, cdn);

        setTimeout(() => {
            update_totals(frm);
        }, 50);
    }
});

frappe.ui.form.on("EC Process Lot Item", {

    lot_items_remove(frm) {

        setTimeout(() => {
            update_totals(frm);
        }, 100);

    }

});