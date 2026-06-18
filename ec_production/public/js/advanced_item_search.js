
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

            grid.wrapper.on(
                "click",
                ".advanced-search-btn",
                () => {
                    open_advanced_search(frm);
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
                        >
                            <td>
                                ${item.item_code}
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

                if (!qty) {
                    return;
                }

                selected_items.push({
                    item_code: $(this).attr("data-item"),
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

                console.log(
                    "[Bulk Add] Selected Items:",
                    selected_items
                );

                const r = await frappe.call({
                    method:
                        "ec_production.api.item.get_barcodes",
                    args: {
                        items: selected_items
                    }
                });

                const barcode_map =
                    r.message || {};

                console.log(
                    "[Bulk Add] Barcode Map:",
                    barcode_map
                );

                let added = 0;
                let failed = 0;

                if (!frm._bulk_scanner) {
                    frm._bulk_scanner = new erpnext.utils.BarcodeScanner({
                        frm
                    });
                }

                const scanner = frm._bulk_scanner;

                for (const row of selected_items) {

                    const barcode =
                        barcode_map[row.item_code];

                    if (!barcode) {
                        continue;
                    }

                    // console.log(
                    //     `[Bulk Add] Processing ${row.item_code}`
                    // );

                    // console.log(
                    //     `[Bulk Add] Barcode ${barcode}`
                    // );

                    // Scan only once
                    try {

                        // console.log(
                        //     `calling scanner`
                        // );

                        // console.log(
                        //     `setting field value`
                        // );
                        scanner.scan_barcode_field.set_value(
                            barcode
                        );

                        scanner.scan_barcode_field.value =
                            barcode;

                        await frappe.utils.sleep(200);

                        // console.log(
                        //     `calling process scan `
                        // );

                        const p = scanner.process_scan();

                        // console.log("process_scan started");

                        await Promise.race([
                            p,
                            frappe.utils.sleep(3000)
                        ]);

                        // console.log("process_scan finished or timed out");

                        // console.log(
                        //     `scan processed`
                        // );

                        added++;

                        // console.log(
                        //     `${barcode} added`
                        // );

                    } catch (e) {

                        failed++;

                        console.error(e);
                    }
                }


                // console.log(
                //     "Selected Items",
                //     selected_items
                // );

                // console.log(
                //     "Current Grid",
                //     frm.doc.items.map(d => ({
                //         item_code: d.item_code,
                //         qty: d.qty
                //     }))
                // );

                await frappe.utils.sleep(1500);

                frm.refresh_field("items");

                // console.table(
                //     frm.doc.items.map(d => ({
                //         item_code: d.item_code,
                //         qty: d.qty,
                //         row: d.name
                //     }))
                // );

                for (const selected of selected_items) {

                    const rows = frm.doc.items.filter(
                        d => d.item_code === selected.item_code
                    );

                    // console.log(
                    //     `Found ${rows.length} row(s) for ${selected.item_code}`
                    // );

                    for (const row of rows) {

                        // console.log(
                        //     `Updating ${row.item_code} from ${row.qty} to ${selected.qty}`
                        // );

                        await frappe.model.set_value(
                            row.doctype,
                            row.name,
                            "qty",
                            selected.qty
                        );

                        // Force ERPNext recalculation
                        await frm.script_manager.trigger(
                            "qty",
                            row.doctype,
                            row.name
                        );
                    }
                }

                frm.refresh_field("items");
                frm.dirty();

                console.log(
                    "[Bulk Add] Complete",
                    {
                        added,
                        failed,
                        total_rows:
                            frm.doc.items?.length
                    }
                );

                frappe.show_alert({
                    message: __(
                        `${added} barcode(s) processed`
                    ),
                    indicator: "green"
                });

                dialog.hide();

            } catch (e) {

                console.error(
                    "[Bulk Add] Fatal Error",
                    e
                );

                frappe.msgprint(
                    __("Failed to populate items")
                );

            } finally {

                frappe.dom.unfreeze();
            }
        }
    );
}