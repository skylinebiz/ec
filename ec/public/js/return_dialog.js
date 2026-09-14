frappe.provide("ec.utils");

/**
 * Shared "Return Items" dialog used by both the Delivery Note (Sales
 * Return) and Purchase Invoice (Debit Note) list views. The two callers
 * differ only in doctype/party/field names - all handled via `config`:
 *
 *   doctype           Raw doctype name, e.g. "Delivery Note"
 *                      (used for frappe.utils.get_form_link AND, wrapped
 *                      in __(), for display text)
 *   doctype_plural     Raw plural, e.g. "Delivery Notes" (display only)
 *   route_slug         e.g. "delivery-note" - fallback link when
 *                      frappe.utils.get_form_link isn't available
 *   api_module         e.g. "ec.api.delivery_note" - dotted path whose
 *                      scan_barcode / find_return_allocations /
 *                      process_returns this dialog calls
 *   party_fieldname    e.g. "customer" or "supplier"
 *   party_label        Raw label, e.g. "Customer" (display only)
 *   party_doctype      Link options, e.g. "Customer"
 *   doc_fieldname      Key name the backend uses for the source document
 *                      in request/response payloads, e.g. "delivery_note"
 *
 * process_returns only ever gets {item_code, qty} per item plus the
 * source document name - nothing else (rate, uom, which original row,
 * taxes, ...) is sent from here; the backend resolves all of that
 * itself from the source document.
 */
ec.utils.open_return_dialog = function (config) {

    // Kept in code but not rendered for now - flip to true to bring back a
    // per-row "Process Return" button alongside "Process All Returns".
    const SHOW_ROW_PROCESS_BUTTON = false;

    const state = {
        wanted: {},         // item_code -> {item_code, item_name, qty}
        results: [],        // [{item_code, item_name, doc_name, posting_date, returnable_qty, qty, processed}]
        mode: "wanted",     // "wanted" (Items to Return table) or "results" (post-search, split by source document)
        processing: 0       // count of in-flight "Process Return" calls
    };

    let dialog;

    function add_wanted_item(item_code, item_name, qty_delta) {

        if (!state.wanted[item_code]) {
            state.wanted[item_code] = {
                item_code,
                item_name: item_name || item_code,
                qty: 0
            };
        }

        state.wanted[item_code].qty = flt(state.wanted[item_code].qty) + flt(qty_delta);

        // A freshly scanned/added item should be visible right away, even
        // if the table is currently showing a previous search's results.
        state.mode = "wanted";
    }

    function render_items() {

        const wrapper = dialog.fields_dict.items_html.$wrapper;

        if (state.mode === "results") {
            render_results_table(wrapper);
        } else {
            render_wanted_table(wrapper);
        }
    }

    function render_wanted_table(wrapper) {

        const rows = Object.values(state.wanted);

        if (!rows.length) {
            wrapper.html(
                `<div class="text-muted text-center p-3">${__("No items added yet")}</div>`
            );
            return;
        }

        let html = `
            <table class="table table-bordered">
                <thead>
                    <tr>
                        <th>${__("Item")}</th>
                        <th width="120">${__("Qty")}</th>
                        <th width="40"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach(row => {
            html += `
                <tr data-item="${frappe.utils.escape_html(row.item_code)}">
                    <td>${frappe.utils.escape_html(row.item_name || row.item_code)}</td>
                    <td>
                        <input
                            type="number"
                            min="0"
                            step="any"
                            class="form-control form-control-sm qty-input"
                            value="${flt(row.qty)}"
                        >
                    </td>
                    <td class="text-center">
                        <a class="text-danger remove-row" title="${__("Remove")}">
                            ${frappe.utils.icon("close", "sm")}
                        </a>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;

        wrapper.html(html);
    }

    function render_results_table(wrapper) {

        if (!state.results.length) {
            wrapper.html(
                `<div class="text-muted text-center p-3">${__("No matching {0} found", [__(config.doctype_plural)])}</div>`
            );
            return;
        }

        let html = `
            <table class="table table-bordered">
                <thead>
                    <tr>
                        <th>${__("Item")}</th>
                        <th>${__(config.doctype)}</th>
                        <th>${__("Posting Date")}</th>
                        <th width="110">${__("Returnable Qty")}</th>
                        <th width="110">${__("Qty")}</th>
                        <th width="160"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        state.results.forEach((row, idx) => {

            if (row.not_found) {
                html += `
                    <tr data-idx="${idx}" style="background-color: rgba(220, 53, 69, 0.12);">
                        <td>${frappe.utils.escape_html(row.item_name || row.item_code)}</td>
                        <td>&mdash;</td>
                        <td>&mdash;</td>
                        <td>0</td>
                        <td>${flt(row.qty)}</td>
                        <td class="text-center text-danger">
                            ${__("No {0} found", [__(config.doctype)])}
                        </td>
                    </tr>
                `;
                return;
            }

            const doc_link = frappe.utils.get_form_link
                ? frappe.utils.get_form_link(config.doctype, row.doc_name)
                : `/desk/${config.route_slug}/${encodeURIComponent(row.doc_name)}`;

            html += `
                <tr data-idx="${idx}">
                    <td>${frappe.utils.escape_html(row.item_name || row.item_code)}</td>
                    <td><a href="${doc_link}" target="_blank">${frappe.utils.escape_html(row.doc_name)}</a></td>
                    <td>${frappe.datetime.str_to_user(row.posting_date) || ""}</td>
                    <td>${flt(row.returnable_qty)}</td>
                    <td>
                        ${row.processed
                    ? flt(row.qty)
                    : `<input
                                    type="number"
                                    min="0"
                                    max="${flt(row.returnable_qty)}"
                                    step="any"
                                    class="form-control form-control-sm result-qty-input"
                                    value="${flt(row.qty)}"
                                >`
                }
                    </td>
                    <td class="text-center">
                        ${row.processed
                    ? `<span class="text-success">
                                    ${__("Returned")}: ${frappe.utils.escape_html(row.processed)}
                                </span>`
                    : SHOW_ROW_PROCESS_BUTTON
                        ? `<button class="btn btn-xs btn-primary process-return-btn">
                                        ${__("Process Return")}
                                    </button>`
                        : ""
                }
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;

        wrapper.html(html);
    }

    function on_party_change() {

        // Results/items were scoped to the previous party - drop them
        // rather than risk mixing parties in one return.
        state.wanted = {};
        state.results = [];
        state.mode = "wanted";

        render_items();
    }

    function on_scan() {

        const barcode = dialog.get_value("scan_barcode");
        if (!barcode) return;

        dialog.set_value("scan_barcode", "");

        frappe.call({
            method: "erpnext.stock.utils.scan_barcode",
            args: { search_value: barcode },
            callback(r) {
                const data = r.message;

                if (!data || !data.item_code) {
                    frappe.show_alert({
                        message: __("Cannot find Item with this Barcode"),
                        indicator: "orange"
                    });
                    return;
                }
                add_wanted_item(data.item_code, data.item_name, 1);
                render_items();

                frappe.show_alert({
                    message: __("{0} added", [data.item_name || data.item_code]),
                    indicator: "green"
                });
            }
        });
    }

    function open_advanced_item_search() {

        const search_dialog = new frappe.ui.Dialog({
            title: __("Advanced Item Search"),
            size: "extra-large",
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "content"
                }
            ]
        });

        search_dialog.show();

        const wrapper = search_dialog.fields_dict.content.$wrapper;

        wrapper.html(`
            <div style="
                display:grid;
                grid-template-columns:repeat(8,1fr);
                gap:8px;
                align-items:end;
            ">
                <div>
                    <label>${__("Barcode")}</label>
                    <input class="form-control barcode">
                </div>
                <div>
                    <label>${__("Style No")}</label>
                    <input class="form-control style-no">
                </div>
                <div>
                    <label>${__("Colour")}</label>
                    <input class="form-control colour">
                </div>
                <div>
                    <label>${__("Colour Code")}</label>
                    <input class="form-control colour-code">
                </div>
                <div>
                    <label>${__("Size")}</label>
                    <input class="form-control size">
                </div>
                <div>
                    <label>${__("MRP")}</label>
                    <input class="form-control mrp">
                </div>
                <div>
                    <label>${__("WSP")}</label>
                    <input class="form-control wsp">
                </div>
                <div>
                    <label>${__("Group Name")}</label>
                    <input class="form-control group-name">
                </div>
            </div>

            <div class="text-right mt-3">
                <button class="btn btn-primary search-btn">${__("Search")}</button>
            </div>

            <div class="search-results mt-4"></div>
        `);

        bind_advanced_item_search(wrapper, search_dialog);
    }

    function bind_advanced_item_search(wrapper, search_dialog) {

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

            const has_filter = Object.values(filters).some(v => v);

            if (!has_filter) {
                frappe.msgprint(__("Please enter at least one search filter"));
                return;
            }

            wrapper.find(".search-btn").prop("disabled", true).text(__("Searching..."));

            frappe.call({
                method: "ec.api.item.search_items",
                args: { ...filters, limit_page_length: 50 },
                callback(r) {

                    wrapper.find(".search-btn").prop("disabled", false).text(__("Search"));

                    const items = r.message || [];

                    if (!items.length) {
                        wrapper.find(".search-results").html(
                            `<div class="text-center text-muted p-4">${__("No records found")}</div>`
                        );
                        return;
                    }

                    let html = `
                        <table class="table table-bordered">
                            <thead>
                                <tr>
                                    <th>${__("Item")}</th>
                                    <th>${__("Barcode")}</th>
                                    <th>${__("Colour")}</th>
                                    <th>${__("Size")}</th>
                                    <th>${__("MRP")}</th>
                                    <th>${__("WSP")}</th>
                                    <th width="120">${__("Qty")}</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;

                    items.forEach(item => {
                        html += `
                            <tr
                                data-item="${frappe.utils.escape_html(item.item_code)}"
                                data-item-name="${frappe.utils.escape_html(item.item_name || item.item_code)}"
                            >
                                <td>${frappe.utils.escape_html(item.item_code)}</td>
                                <td>${frappe.utils.escape_html(item.barcode || "")}</td>
                                <td>${frappe.utils.escape_html(item.colour || "")}</td>
                                <td>${frappe.utils.escape_html(item.size || "")}</td>
                                <td>${item.mrp || ""}</td>
                                <td>${item.wsp ? flt(item.wsp, 3).toFixed(3) : "0.000"}</td>
                                <td>
                                    <input type="number" min="0" value="0" class="form-control qty-input">
                                </td>
                            </tr>
                        `;
                    });

                    html += `
                            </tbody>
                        </table>

                        <div class="text-muted mb-2">
                            ${__("Showing {0} record(s) (maximum 50)", [items.length])}
                        </div>

                        <div class="text-right">
                            <button class="btn btn-primary populate-btn">${__("Populate")}</button>
                        </div>
                    `;

                    wrapper.find(".search-results").html(html);
                },
                error() {
                    wrapper.find(".search-btn").prop("disabled", false).text(__("Search"));
                    frappe.msgprint(__("Failed to fetch items"));
                }
            });
        });

        wrapper.on("click", ".populate-btn", () => {

            const selected = [];

            wrapper.find("tbody tr").each(function () {

                const qty = flt($(this).find(".qty-input").val());
                if (!qty) return;

                selected.push({
                    item_code: $(this).attr("data-item"),
                    item_name: $(this).attr("data-item-name"),
                    qty
                });
            });

            if (!selected.length) {
                frappe.msgprint(__("Please enter quantity"));
                return;
            }

            selected.forEach(item => {
                add_wanted_item(item.item_code, item.item_name, item.qty);
            });

            render_items();

            frappe.show_alert({
                message: __("{0} item(s) added", [selected.length]),
                indicator: "green"
            });

            search_dialog.hide();
        });
    }

    function find_matching_docs() {

        const party = dialog.get_value(config.party_fieldname);

        if (!party) {
            frappe.msgprint(__("Please select a {0}", [__(config.party_label)]));
            return;
        }

        const items = Object.values(state.wanted)
            .filter(d => flt(d.qty) > 0)
            .map(d => ({ item_code: d.item_code, qty: flt(d.qty) }));

        if (!items.length) {
            frappe.msgprint(__("Please add at least one item"));
            return;
        }

        const order = dialog.get_value("order") || "FIFO";

        frappe.call({
            method: `${config.api_module}.find_return_allocations`,
            args: { items, order, [config.party_fieldname]: party },
            freeze: true,
            freeze_message: __("Finding {0}...", [__(config.doctype_plural)]),
            callback(r) {

                const data = r.message || {};

                const matched_rows = (data.rows || []).map(row => ({
                    ...row,
                    doc_name: row[config.doc_fieldname],
                    processed: null,
                    not_found: false
                }));

                // Items with nothing (or not enough) returnable stay
                // visible as their own flagged row instead of silently
                // disappearing from the table.
                const shortfall_rows = (data.shortfalls || []).map(s => ({
                    item_code: s.item_code,
                    item_name: (state.wanted[s.item_code] && state.wanted[s.item_code].item_name) || s.item_code,
                    doc_name: null,
                    detail: null,
                    posting_date: null,
                    returnable_qty: 0,
                    qty: s.shortfall_qty,
                    processed: null,
                    not_found: true
                }));

                state.results = [...matched_rows, ...shortfall_rows];
                state.mode = "results";
                render_items();

                (data.shortfalls || []).forEach(s => {
                    frappe.show_alert({
                        message: __(
                            "{0}: only {1} of {2} requested is returnable across all submitted {3}",
                            [s.item_code, flt(s.returnable_qty), flt(s.requested_qty), __(config.doctype_plural)]
                        ),
                        indicator: "orange"
                    }, 7);
                });
            }
        });
    }

    function call_process_returns(doc_name, items) {

        return new Promise(resolve => {

            frappe.call({
                method: `${config.api_module}.process_returns`,
                args: { [config.doc_fieldname]: doc_name, items },
                callback(r) {
                    resolve({ success: !!r.message, name: r.message });
                },
                error() {
                    resolve({ success: false });
                }
            });
        });
    }

    async function process_group(doc_name, idxs) {

        // Every idx here shares the same source document - they become
        // ONE return document, not one per item. Only item_code/qty are
        // sent - the backend resolves everything else from doc_name.
        const items = idxs.map(idx => {
            const row = state.results[idx];
            return { item_code: row.item_code, qty: row.qty };
        });

        state.processing++;
        const result = await call_process_returns(doc_name, items);
        state.processing--;

        if (result.success) {
            idxs.forEach(idx => {
                state.results[idx].processed = result.name;
            });
        }

        return result;
    }

    async function process_row_by_idx(idx) {

        const row = state.results[idx];

        if (!row || row.not_found || row.processed || flt(row.qty) <= 0) {
            return { skipped: true };
        }

        return await process_group(row.doc_name, [idx]);
    }

    async function process_row(idx, $btn) {

        const row = state.results[idx];
        if (!row || row.not_found || row.processed) return;

        if (flt(row.qty) <= 0) {
            frappe.show_alert({
                message: __("Enter a quantity greater than 0"),
                indicator: "orange"
            });
            return;
        }

        $btn.prop("disabled", true).text(__("Processing..."));

        const result = await process_row_by_idx(idx);

        if (result.success) {
            render_items();

            frappe.show_alert({
                message: __("Return {0} created & submitted", [result.name]),
                indicator: "green"
            });
        } else {
            $btn.prop("disabled", false).text(__("Process Return"));
        }
    }

    async function process_all_returns() {

        const idxs = state.results
            .map((row, idx) => idx)
            .filter(idx => {
                const row = state.results[idx];
                return row && !row.not_found && !row.processed && flt(row.qty) > 0;
            });

        if (!idxs.length) {
            frappe.msgprint(__("No rows with a Qty to Return to process"));
            return;
        }

        // Group rows by source document - every item returned from the
        // same source document becomes ONE return document.
        const groups = new Map();

        idxs.forEach(idx => {
            const doc_name = state.results[idx].doc_name;
            if (!groups.has(doc_name)) groups.set(doc_name, []);
            groups.get(doc_name).push(idx);
        });

        dialog.disable_primary_action();
        dialog.get_secondary_btn().prop("disabled", true);

        const $primary_btn = dialog.get_primary_btn();

        let done = 0;
        let failed = 0;
        const total = groups.size;

        for (const [doc_name, group_idxs] of groups) {

            $primary_btn.text(__("Processing {0} of {1}...", [done + failed + 1, total]));

            const result = await process_group(doc_name, group_idxs);

            if (result.success) {
                done++;
            } else {
                failed++;
            }

            render_items();
        }

        dialog.enable_primary_action();
        dialog.get_secondary_btn().prop("disabled", false);
        $primary_btn.text(__("Process All Returns"));

        frappe.show_alert({
            message: failed
                ? __("{0} return(s) created, {1} failed", [done, failed])
                : __("{0} return(s) created & submitted", [done]),
            indicator: failed ? "orange" : "green"
        }, 7);
    }

    dialog = new frappe.ui.Dialog({
        title: __("Return Items"),
        size: "large",
        // Not dismissible except via the explicit Close button below -
        // no X (hidden), no Esc, no backdrop-click.
        static: true,
        fields: [
            {
                fieldtype: "Link",
                fieldname: config.party_fieldname,
                label: __(config.party_label),
                options: config.party_doctype,
                reqd: 1,
                onchange: () => on_party_change()
            },
            {
                fieldtype: "Column Break"
            },
            {
                fieldtype: "Data",
                fieldname: "scan_barcode",
                label: __("Scan Barcode"),
                options: "Barcode",
                depends_on: `eval:doc.${config.party_fieldname}`,
                onchange: () => on_scan()
            },
            {
                fieldtype: "Button",
                fieldname: "add_multiple",
                label: __("Add Multiple Items"),
                depends_on: `eval:doc.${config.party_fieldname}`,
                click: () => open_advanced_item_search()
            },
            {
                fieldtype: "Column Break"
            },
            {
                fieldtype: "Select",
                fieldname: "order",
                label: __("Return Order"),
                options: "FIFO\nLIFO",
                default: "FIFO",
                description: __(
                    "FIFO returns against the oldest {0} first, LIFO against the newest first",
                    [__(config.doctype)]
                )
            },

            {
                fieldtype: "Section Break",
                label: __("Items to Return")
            },
            {
                fieldtype: "HTML",
                fieldname: "items_html"
            },
            {
                fieldtype: "Button",
                fieldname: "find_btn",
                label: __("Find {0}", [__(config.doctype_plural)]),
                click: () => find_matching_docs()
            },
            {
                fieldtype: "Section Break"
            },

        ],
        primary_action_label: __("Process All Returns"),
        primary_action: () => process_all_returns(),
        secondary_action_label: __("Close"),
        secondary_action: () => dialog.hide()
    });

    dialog.fields_dict.items_html.$wrapper.on("change", ".qty-input", function () {

        const item_code = $(this).closest("tr").attr("data-item");
        const row = state.wanted[item_code];
        if (!row) return;

        const qty = Math.max(0, flt($(this).val()));
        row.qty = qty;
        $(this).val(qty);
    });

    dialog.fields_dict.items_html.$wrapper.on("click", ".remove-row", function () {

        const item_code = $(this).closest("tr").attr("data-item");
        delete state.wanted[item_code];
        render_items();
    });

    dialog.fields_dict.items_html.$wrapper.on("click", ".process-return-btn", function () {

        const idx = cint($(this).closest("tr").attr("data-idx"));
        process_row(idx, $(this));
    });

    dialog.fields_dict.items_html.$wrapper.on("change", ".result-qty-input", function () {

        const idx = cint($(this).closest("tr").attr("data-idx"));
        const row = state.results[idx];
        if (!row) return;

        const qty = Math.max(0, Math.min(flt($(this).val()), flt(row.returnable_qty)));
        row.qty = qty;
        $(this).val(qty);
    });

    // Block closing (X, Esc, backdrop click, and the Close button below)
    // while a return is being processed, so it can't be interrupted mid-flight.
    dialog.$wrapper.on("hide.bs.modal", function (e) {

        if (state.processing > 0) {

            e.preventDefault();

            frappe.show_alert({
                message: __("Please wait for the return(s) being processed to finish."),
                indicator: "orange"
            });
        }
    });

    render_items();
    dialog.show();
};
