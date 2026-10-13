frappe.ui.form.on("*", {
    refresh(frm) {

        console.log("Current Doctype:", frm.doctype);

        let table_field = Object.values(frm.fields_dict || {}).find(field => {

            if (field.df.fieldtype !== "Table") {
                return false;
            }

            const grid = field.grid;

            if (!grid) {

                return false;
            }

            const has_item_code = grid.docfields.some(
                df => df.fieldname === "item_code"
            );

            return has_item_code;
        });

        if (!table_field) {

            return;
        }

        const grid = table_field.grid;

        if (
            grid.wrapper.find(".advanced-search-btn").length
        ) {
            console.log(
                "Buttons already exist. Skipping."
            );
            return;
        }

        grid.wrapper.find(".grid-buttons").append(`
            <button class="btn btn-xs btn-secondary advanced-search-btn">
                Advanced Search
            </button>
        `);

        grid.wrapper.find(".grid-buttons").append(`
            <button class="btn btn-xs btn-secondary item-visualizer-btn">
                Item Visualizer
            </button>
        `);

        grid.wrapper.on(
            "click",
            ".advanced-search-btn",
            () => {
                open_advanced_search(
                    frm,
                    table_field.df.fieldname
                );
            }
        );

        grid.wrapper.on(
            "click",
            ".item-visualizer-btn",
            () => {
                open_item_visualizer(
                    frm,
                    table_field.df.fieldname
                );
            }
        );
    }
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
                <label>Barcode</label>
                <input class="form-control barcode">
            </div>

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

        <div class="populate-progress mt-3" style="display:none;">

        <div style="display:flex;align-items:center;gap:8px;">
            <i class="fa fa-spinner fa-spin"
            style="font-size:16px;color:var(--primary);"></i>

            <span class="progress-text">
                Populating 0 of 0
            </span>
        </div>

            <div class="mt-2">
                Pending:
                <b class="pending-count">0</b>

                &nbsp;|&nbsp;

                Inserted:
                <b class="inserted-count">0</b>
            </div>

        </div>

        <div class="search-results mt-4"></div>
    `);

    bind_search(frm, wrapper, d);
};

function bind_search(frm, wrapper, dialog) {

    let datatable = null;
    let search_items = [];

    // qty typed per original row index (survives sort / filter re-render)
    let qty_map = {};

    const qty_col = () => datatable.datamanager.getColumnIndexById("qty");

    const reset_qty = () => {

        qty_map = {};

        wrapper.find(".qty-input").val(0);

        if (!datatable) return;

        const col = qty_col();

        datatable.datamanager.rows.forEach(row => {
            datatable.datamanager.updateCell(
                col, row[0].rowIndex, { content: 0 }
            );
        });
    };

    wrapper.on("input change", ".qty-input", function () {

        if (!datatable) return;

        const idx = cint($(this).attr("data-row"));
        const val = cint($(this).val());

        qty_map[idx] = val;

        datatable.datamanager.updateCell(
            qty_col(), idx, { content: val }
        );
    });

    wrapper.on("click", ".search-btn", () => {

        const filters = {
            style_no: wrapper.find(".style-no").val()?.trim(),
            barcode: wrapper.find(".barcode").val()?.trim(),
            colour: wrapper.find(".colour").val()?.trim(),
            colour_code: wrapper.find(".colour-code").val()?.trim(),
            size: wrapper.find(".size").val()?.trim(),
            mrp: wrapper.find(".mrp").val()?.trim(),
            wsp: wrapper.find(".wsp").val()?.trim(),
            group_name: wrapper.find(".group-name").val()?.trim()
        };

        // Don't allow empty search
        const hasFilter = Object.values(filters)
            .some(value => value);

        if (!hasFilter) {

            frappe.msgprint(
                __("Please enter at least one search filter")
            );

            return;
        }

        wrapper.find(".search-btn")
            .prop("disabled", true)
            .text(__("Searching..."));

        frappe.call({
            method: "ec.api.item.search_items",

            args: {
                ...filters,
                limit_page_length: 50
            },

            callback(r) {

                wrapper.find(".search-btn")
                    .prop("disabled", false)
                    .text(__("Search"));

                const items = r.message || [];

                if (!items.length) {

                    wrapper.find(".search-results").html(`
                    <div class="text-center text-muted p-4">
                        No records found
                    </div>
                `);

                    return;
                }

                wrapper.find(".search-results").html(`
                <div class="results-table"></div>

                <div class="text-muted mt-2 mb-2">
                    Showing ${items.length} record(s)
                    (maximum 50)
                </div>

                <div class="text-right">
                    <button
                        class="btn btn-primary add-selected-items">
                        Populate
                    </button>
                </div>
            `);

                search_items = items;
                qty_map = {};

                datatable = new frappe.DataTable(
                    wrapper.find(".results-table").get(0),
                    {
                        columns: [
                            { id: "item_code", name: __("Item"), editable: false, width: 260 },
                            { id: "barcode", name: __("Barcode"), editable: false, width: 140 },
                            { id: "colour", name: __("Colour"), editable: false, width: 120 },
                            { id: "size", name: __("Size"), editable: false, width: 80 },
                            { id: "mrp", name: __("MRP"), editable: false, width: 90 },
                            { id: "wsp", name: __("WSP"), editable: false, width: 90 },
                            {
                                id: "qty",
                                name: __("Qty"),
                                editable: false,
                                width: 120,
                                format: (value, row) => `
                                    <input
                                        type="number"
                                        min="0"
                                        data-row="${row[0].rowIndex}"
                                        value="${qty_map[row[0].rowIndex] || 0}"
                                        class="form-control qty-input"
                                    >`
                            }
                        ].map(col => ({
                            format: value => frappe.utils.escape_html(
                                value === null || value === undefined
                                    ? ""
                                    : String(value)
                            ),
                            ...col
                        })),
                        data: items.map(item => [
                            item.item_code,
                            item.barcode || "",
                            item.colour || "",
                            item.size || "",
                            item.mrp || "",
                            item.wsp
                                ? flt(item.wsp, 3).toFixed(3)
                                : "0.000",
                            0
                        ]),
                        disableReorderColumn: true,
                        inlineFilters: true,
                        layout: "fluid",
                        cellHeight: 40,
                        noDataMessage: __("No records found")
                    }
                );
            },

            error() {

                wrapper.find(".search-btn")
                    .prop("disabled", false)
                    .text(__("Search"));

                frappe.msgprint(
                    __("Failed to fetch items")
                );
            }
        });
    });

    let is_populating = false;

    dialog.$wrapper.on("hide.bs.modal", function (e) {

        if (is_populating) {

            e.preventDefault();

            frappe.throw(
                __("Items are currently being populated. Please wait.")
            );
        }
    });

    wrapper.on(
        "click",
        ".add-selected-items",
        async () => {

            if (is_populating) return;

            const selected_items = [];

            if (datatable) {

                datatable.datamanager.rows.forEach(row => {

                    const qty = cint(qty_map[row[0].rowIndex]);

                    if (!qty) return;

                    const item = search_items[row[0].rowIndex];

                    selected_items.push({
                        item_code: item.item_code,
                        barcode: item.barcode || "",
                        qty
                    });
                });
            }

            if (!selected_items.length) {

                frappe.msgprint(
                    __("Please enter quantity")
                );

                return;
            }

            // Production Plan
            if (frm.doctype === "Production Plan") {

                is_populating = true;

                wrapper.find(".populate-progress")
                    .show();

                wrapper.find(".search-btn")
                    .prop("disabled", true);

                wrapper.find(".add-selected-items")
                    .prop("disabled", true);

                wrapper.find(".pending-count")
                    .text(selected_items.length);

                wrapper.find(".inserted-count")
                    .text(0);

                wrapper.find(".progress-text")
                    .text(
                        __("Populating 0 of {0}", [
                            selected_items.length
                        ])
                    );

                frappe.call({
                    method:
                        "ec.api.production_plan.populate_production_plan_items",

                    args: {
                        doc: frm.doc,
                        items: selected_items
                    },

                    callback(r) {

                        try {

                            if (!r.message) return;

                            frm.clear_table("po_items");

                            let inserted = 0;
                            let total =
                                r.message.po_items.length;

                            (r.message.po_items || [])
                                .forEach(d => {

                                    let row =
                                        frm.add_child(
                                            "po_items"
                                        );

                                    Object.keys(d)
                                        .forEach(key => {

                                            if ([
                                                "name",
                                                "parent",
                                                "parentfield",
                                                "parenttype",
                                                "doctype"
                                            ].includes(key))
                                                return;

                                            row[key] = d[key];
                                        });

                                    inserted++;

                                    wrapper
                                        .find(
                                            ".inserted-count"
                                        )
                                        .text(inserted);

                                    wrapper
                                        .find(
                                            ".pending-count"
                                        )
                                        .text(
                                            total - inserted
                                        );

                                    wrapper
                                        .find(
                                            ".progress-text"
                                        )
                                        .text(
                                            `Populating ${inserted} of ${total}`
                                        );
                                });

                            frm.refresh_field("po_items");

                            frappe.show_alert({
                                message:
                                    __("Items populated"),
                                indicator: "green"

                            });
                            reset_qty();

                        } finally {

                            is_populating = false;

                            wrapper.find(
                                ".search-btn"
                            ).prop(
                                "disabled",
                                false
                            );

                            wrapper.find(
                                ".add-selected-items"
                            ).prop(
                                "disabled",
                                false
                            );

                            wrapper.find(".fa-spinner").hide();

                            wrapper.find(
                                ".progress-text"
                            ).text(
                                __("Completed")
                            );
                        }
                    }
                });

                return;
            }

            // Sales Order / Quotation / Invoice

            is_populating = true;

            wrapper.find(".populate-progress")
                .show();

            wrapper.find(".search-btn")
                .prop("disabled", true);

            wrapper.find(".add-selected-items")
                .prop("disabled", true);

            let inserted = 0;
            let total = selected_items.length;
            let pending = total;

            wrapper.find(".pending-count")
                .text(pending);

            wrapper.find(".inserted-count")
                .text(inserted);

            wrapper.find(".progress-text")
                .text(`Populating 0 of ${total}`);

            try {

                for (const item of selected_items) {

                    let existing =
                        frm.doc.items.find(
                            d =>
                                d.item_code ===
                                item.item_code
                        );

                    if (existing) {

                        await frappe.model.set_value(
                            existing.doctype,
                            existing.name,
                            "qty",
                            cint(existing.qty)
                            + cint(item.qty)
                        );

                    } else {

                        const row =
                            frm.add_child("items");

                        await frappe.model.set_value(
                            row.doctype,
                            row.name,
                            "item_code",
                            item.item_code
                        );

                        await frappe.model.set_value(
                            row.doctype,
                            row.name,
                            "qty",
                            cint(item.qty)
                        );
                    }

                    inserted++;
                    pending--;

                    wrapper.find(".inserted-count")
                        .text(inserted);

                    wrapper.find(".pending-count")
                        .text(pending);

                    wrapper.find(".progress-text")
                        .text(
                            `Populating ${inserted} of ${total}`
                        );
                }

                frm.refresh_field("items");

                frappe.show_alert({
                    message: __(
                        `${inserted} item(s) populated`
                    ),
                    indicator: "green"
                });

                reset_qty();

            } catch (e) {

                console.error(e);

                frappe.msgprint(
                    __("Failed to populate items")
                );

            } finally {

                is_populating = false;

                wrapper.find(".search-btn")
                    .prop("disabled", false);

                wrapper.find(".add-selected-items")
                    .prop("disabled", false);

                wrapper.find(".fa-spinner").hide();

                wrapper.find(".progress-text")
                    .text(
                        `Completed ${inserted} of ${total}`
                    );

                reset_qty();
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
        method: "ec.api.item.get_item_visualizer_data",
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
                    <td colspan="3">Grand Total</td>
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