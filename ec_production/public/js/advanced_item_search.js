
[
    "Sales Order",
    "Quotation",
    "Sales Invoice",
    "Delivery Note",
    "Purchase Order",
    "Purchase Receipt"
].forEach(doctype => {

    frappe.ui.form.on(doctype, {
        refresh(frm) {

            const grid = frm.fields_dict.items?.grid;

            if (!grid) return;

            if (
                grid.wrapper.find(".advanced-search-btn").length
            ) {
                return;
            }

            grid.wrapper
                .find(".grid-buttons")
                .append(`
                    <button
                        class="btn btn-xs btn-secondary advanced-search-btn"
                    >
                        Advanced Search
                    </button>
                `);

            grid.wrapper
                .find(".grid-buttons")
                .append(`
                    <button
                        class="btn btn-xs btn-secondary item-visualizer-btn"
                    >
                        Item Visualizer
                    </button>
                `);

            grid.wrapper.on(
                "click",
                ".advanced-search-btn",
                () => {
                    open_advanced_search(frm);
                }
            );

            grid.wrapper.on(
                "click",
                ".item-visualizer-btn",
                () => {
                    open_item_visualizer(frm);
                }
            );
        }
    });

});

function open_advanced_search(frm) {

    const d = new frappe.ui.Dialog({
        title: __("Advanced Item Search"),
        size: "extra-large",
        fields: [
            {
                fieldtype: "HTML",
                fieldname: "content"
            }
        ]
    });

    d.show();

    const wrapper =
        d.fields_dict.content.$wrapper;

    wrapper.html(`
        <div style="
            display:grid;
            grid-template-columns:repeat(8,1fr);
            gap:8px;
            align-items:end;
        ">

            <div>
                <label>Style No</label>
                <input class="form-control style-no">
            </div>

            <div>
                <label>Barcode</label>
                <input class="form-control barcode">
            </div>

            <div>
                <label>Colour</label>
                <input class="form-control colour">
            </div>

            <div>
                <label>Colour Code</label>
                <input class="form-control colour-code">
            </div>

            <div>
                <label>Size</label>
                <input class="form-control size">
            </div>

            <div>
                <label>MRP</label>
                <input class="form-control mrp">
            </div>

            <div>
                <label>WSP</label>
                <input class="form-control wsp">
            </div>

            <div>
                <label>Group Name</label>
                <input class="form-control group-name">
            </div>

            <div>
                <button class="btn btn-primary search-btn">
                    Search
                </button>
            </div>

        </div>

        <div class="search-results mt-4"></div>
    `);

    bind_search(frm, wrapper, d);
};


function bind_search(frm, wrapper, dialog) {

    wrapper.on("click", ".search-btn", () => {

        frappe.call({
            method:
                "ec_production.api.item.search_items",
            args: {
                style_no:
                    wrapper.find(".style-no").val(),

                barcode:
                    wrapper.find(".barcode").val(),

                colour:
                    wrapper.find(".colour").val(),

                colour_code:
                    wrapper.find(".colour-code").val(),

                size:
                    wrapper.find(".size").val(),

                mrp:
                    wrapper.find(".mrp").val(),

                wsp:
                    wrapper.find(".wsp").val(),

                group_name:
                    wrapper.find(".group-name").val(),


            },
            callback(r) {

                const items =
                    r.message || [];

                let html = `
                    <table class="table table-bordered">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Barcode</th>
                                <th>Colour</th>
                                <th>Size</th>
                                <th>MRP</th>
                                <th>WSP</th>
                                <th width="120">Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                items.forEach(item => {

                    html += `
                        <tr
    data-item="${item.item_code}"
    data-barcode="${item.barcode || ''}"
>
                            <td>
                                ${item.item_code}
                            </td>

                            <td>
                                ${item.barcode}
                            </td>

                            <td>
                                ${item.colour || ""}
                            </td>

                            <td>
                                ${item.size || ""}
                            </td>

                            <td>
                                ${item.mrp || ""}
                            </td>

                            <td>
                                ${item.wsp || ""}
                            </td>

                            <td>
                                <input
                                    type="number"
                                    min="0"
                                    value="0"
                                    class="
                                        form-control
                                        qty-input
                                    "
                                >
                            </td>
                        </tr>
                    `;
                });

                html += `
                        </tbody>
                    </table>

                    <div class="text-right">
                        <button
                            class="
                                btn btn-primary
                                add-selected-items
                            "
                        >
                            Populate
                        </button>
                    </div>
                `;

                wrapper
                    .find(".search-results")
                    .html(html);
            }
        });
    });

    wrapper.on(
        "click",
        ".add-selected-items",
        async () => {

            const selected_items = [];

            wrapper.find("tbody tr").each(function () {

                const qty = cint(
                    $(this)
                        .find(".qty-input")
                        .val()
                );

                if (!qty) return;

                selected_items.push({
                    item_code: $(this).attr("data-item"),
                    barcode: $(this).attr("data-barcode"),
                    qty
                });
            });

            if (!selected_items.length) {

                frappe.msgprint(
                    __("Please enter quantity")
                );

                return;
            }

            frappe.dom.freeze(
                __("Populating Items...")
            );

            try {

                // if (!frm._bulk_scanner) {

                //     frm._bulk_scanner =
                //         new erpnext.utils.BarcodeScanner({
                //             frm
                //         });

                //     const original_set_item =
                //         frm._bulk_scanner.set_item;

                //     frm._bulk_scanner.set_item =
                //         function (
                //             row,
                //             item_code,
                //             barcode,
                //             batch_no,
                //             serial_no
                //         ) {

                //             const qty =
                //                 this.bulk_qty || 1;

                //             this.bulk_qty = null;

                //             const original_qty =
                //                 flt(
                //                     row[this.qty_field]
                //                 ) || 0;

                //             row[this.qty_field] =
                //                 original_qty +
                //                 qty -
                //                 1;

                //             return original_set_item.call(
                //                 this,
                //                 row,
                //                 item_code,
                //                 barcode,
                //                 batch_no,
                //                 serial_no
                //             );
                //         };
                // }

                // const scanner =
                //     frm._bulk_scanner;

                let added = 0;

                for (const item of selected_items) {

                    let existing = frm.doc.items.find(
                        d => d.item_code === item.item_code
                    );

                    if (existing) {

                        await frappe.model.set_value(
                            existing.doctype,
                            existing.name,
                            "qty",
                            cint(existing.qty) + cint(item.qty)
                        );

                    } else {

                        const row = frm.add_child("items");

                        await frappe.model.set_value(
                            row.doctype,
                            row.name,
                            "item_code",
                            item.item_code
                        );

                        if (item.qty) {

                            await frappe.model.set_value(
                                row.doctype,
                                row.name,
                                "qty",
                                cint(item.qty)
                            );
                        }
                    }

                    added++;
                }

                frm.refresh_field("items");

                frappe.show_alert({
                    message: __(
                        `${added} item(s) populated`
                    ),
                    indicator: "green"
                });

                dialog.hide();

            } catch (e) {

                console.error(e);

                frappe.msgprint(
                    __("Failed to populate items")
                );

            } finally {

                frappe.dom.unfreeze();
            }
        }
    );
}

function open_item_visualizer(frm) {

    const item_codes = [...new Set(
        (frm.doc.items || [])
            .map(d => d.item_code)
            .filter(Boolean)
    )];

    if (!item_codes.length) {
        frappe.msgprint("No items found");
        return;
    }

    frappe.dom.freeze(__("Loading Item Visualizer..."));

    frappe.call({
        method: "ec_production.api.item.get_item_visualizer_data",
        args: {
            item_codes
        },
        callback: function (r) {

            frappe.dom.unfreeze();

            if (!r.message) return;

            const item_map = r.message;

            const grouped = {};
            const sizes = ["36", "38", "40", "42", "44", "46", "48"];

            frm.doc.items.forEach(row => {

                const details = item_map[row.item_code] || {};

                const style_no = details.style_no || "";
                const colour = details.colour || "";
                const colour_code = details.colour_code || "";
                const size = details.size || "";
                const barcode = details.barcode || "";

                const key =
                    `${style_no}|${colour}|${colour_code}`;

                if (!grouped[key]) {

                    grouped[key] = {
                        style_no,
                        colour,
                        colour_code,
                        barcode,
                        total: 0
                    };

                    sizes.forEach(s => grouped[key][s] = 0);
                    grouped[key].Oth = 0;
                }

                const qty = flt(row.qty);

                if (sizes.includes(size)) {
                    grouped[key][size] += qty;
                } else {
                    grouped[key].Oth += qty;
                }

                grouped[key].total += qty;
            });

            console.log(grouped);

            let html = `
                <div style="overflow:auto;">
                    <table class="table table-bordered">
                        <thead>
                            <tr>
                                <th>Style No</th>
                                <th>Barcode</th>
                                <th>Colour</th>
                                <th>Colour Code</th>
            `;

            sizes.forEach(size => {
                html += `<th>${size}</th>`;
            });

            html += `
                        <th>Oth</th>
                        <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
            `;



            Object.values(grouped).forEach(row => {

                html += `
                <tr>
                    <td>${row.style_no}</td>
                    <td>${row.barcode}</td>
                    <td>${row.colour}</td>
                    <td>${row.colour_code}</td>
            `;

                sizes.forEach(size => {
                    html += `<td>${row[size]}</td>`;
                });

                html += `
                    <td>${row.Oth}</td>
                    <td><b>${row.total}</b></td>
                </tr>
            `;
            });

            const grand_total = {
                Oth: 0,
                total: 0
            };

            sizes.forEach(size => {
                grand_total[size] = 0;
            });

            Object.values(grouped).forEach(row => {

                sizes.forEach(size => {
                    grand_total[size] += row[size] || 0;
                });

                grand_total.Oth += row.Oth || 0;
                grand_total.total += row.total || 0;
            });

            html += `
                <tr style="
                    font-weight:bold;
                    background:#f5f7fa;
                    position:sticky;
                    bottom:0;
                ">
                    <td colspan="4">Grand Total</td>
            `;

            sizes.forEach(size => {
                html += `<td>${grand_total[size]}</td>`;
            });

            html += `
                    <td>${grand_total.Oth}</td>
                    <td>${grand_total.total}</td>
                </tr>
            `;

            html += `
                    </tbody>
                </table>
            </div>
        `;

            const d = new frappe.ui.Dialog({
                title: "Item Visualizer",
                size: "extra-large",
                fields: [
                    {
                        fieldtype: "HTML",
                        fieldname: "visualizer"
                    }
                ]
            });

            d.show();

            d.fields_dict.visualizer.$wrapper.html(html);
        }
    });
}