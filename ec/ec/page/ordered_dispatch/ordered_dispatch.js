frappe.provide("ec");

frappe.pages["ordered-dispatch"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Ordered Dispatch"),
        single_column: true
    });

    wrapper.ordered_dispatch = new ec.OrderedDispatch(page);
};

/**
 * One row per style + colour (colour code) the customer has not had
 * delivered yet, one cell per size showing A|B|C|D:
 *
 *   A  this customer's order qty still to deliver, less D
 *   B  total stock in the selected Warehouse Group, less D
 *   C  other customers' order qty still to deliver for the same item
 *   D  allocation - loaded from the customer's open Pick Lists; click a
 *      cell to add 1 (A and B drop by 1), right-click to remove 1.
 *      "Save Pick List" puts D on the customer's draft Pick List, split
 *      over the group's warehouses; the picker picks and submits it.
 *
 * Data comes from ec.api.ordered_dispatch.get_matrix.
 */
ec.OrderedDispatch = class OrderedDispatch {

    constructor(page) {
        this.page = page;
        this.data = { sizes: [], rows: [], pick_lists: [] };
        this.quantities = {};   // item_code -> D
        this.cells = {};
        this.dirty = false;

        this.make_filters();
        this.make_actions();
        this.make_body();
    }

    make_filters() {
        this.customer_field = this.page.add_field({
            fieldname: "customer",
            label: __("Customer"),
            fieldtype: "Link",
            options: "Customer",
            change: () => this.refresh()
        });

        this.warehouse_field = this.page.add_field({
            fieldname: "warehouse",
            label: __("Warehouse Group"),
            fieldtype: "Link",
            options: "Warehouse",
            get_query: () => ({ filters: { is_group: 1, disabled: 0 } }),
            change: () => this.refresh()
        });

        this.search_field = this.page.add_field({
            fieldname: "search",
            label: __("Search"),
            fieldtype: "Data",
            change: () => this.apply_search()
        });

        this.search_field.$input.on("input", frappe.utils.debounce(() => this.apply_search(), 200));
    }

    make_actions() {
        this.page.set_primary_action(__("Save Pick List"), () => this.save(), "save");
        this.page.set_secondary_action(__("Refresh"), () => this.refresh(), "refresh");

        this.page.add_menu_item(__("Open Pick Lists"), () => {
            const customer = this.customer_field.get_value();
            frappe.set_route("List", "Pick List", customer ? { customer, docstatus: 1 } : {});
        });
        this.page.add_menu_item(__("Cancel Allocation"), () => this.cancel_allocation());
        this.page.add_menu_item(__("Export CSV"), () => this.export_csv());
    }

    make_body() {
        this.$body = $(`
            <div class="ordered-dispatch">
                <div class="od-head">
                    <div class="od-customer text-muted">${__("Select a customer")}</div>
                    <div class="od-pick-list"></div>
                </div>
                <div class="od-legend">
                    <span>${__("Each size")}: <b>${__("Order")} | ${__("Stock")} | ${__("Other Orders")} | ${__("Allocated")}</b></span>
                    <span class="od-chip od-planned">${__("Fully planned")}</span>
                    <span class="od-chip od-short">${__("Stock short of order")}</span>
                    <span class="od-chip od-contended">${__("Shared with other orders")}</span>
                    <span class="od-chip od-available">${__("Stock available")}</span>
                </div>
                <div class="od-table-wrapper"></div>
                <div class="od-footer text-muted"></div>
            </div>
        `).appendTo(this.page.main);

        this.$table = this.$body.find(".od-table-wrapper");

        // Click a cell: D + 1. Right-click: D - 1.
        this.$table.on("click", "td.od-cell[data-item]", (e) => this.change_qty($(e.currentTarget), 1));

        this.$table.on("contextmenu", "td.od-cell[data-item]", (e) => {
            e.preventDefault();
            this.change_qty($(e.currentTarget), -1);
        });
    }

    change_qty($td, delta) {
        const item_code = $td.attr("data-item");
        const cell = this.find_cell(item_code);
        const qty = cint(this.quantities[item_code]) + delta;

        if (qty < 0) return;

        if (qty) {
            this.quantities[item_code] = qty;
        } else {
            delete this.quantities[item_code];
        }

        this.dirty = true;
        $td.find(".od-abc").text(this.format_abc(cell));
        $td.find(".od-d").text(qty);
        this.set_cell_class($td, cell);
        this.render_footer();
    }

    refresh(force) {
        const customer = this.customer_field.get_value();
        const warehouse = this.warehouse_field.get_value();

        if (this.dirty && !force && !confirm(__("Discard the quantities you have not saved?"))) {
            return;
        }

        if (!customer || !warehouse) {
            this.data = { sizes: [], rows: [], pick_lists: [] };
            this.load_quantities();
            this.render();
            return;
        }

        return frappe.call({
            method: "ec.api.ordered_dispatch.get_matrix",
            args: { customer, warehouse },
            freeze: true,
            callback: (r) => {
                this.data = r.message || { sizes: [], rows: [], pick_lists: [] };
                this.load_quantities();
                this.render();
            }
        });
    }

    // D starts from what the customer's open Pick Lists already allocate
    load_quantities() {
        this.quantities = {};
        this.cells = {};    // item_code -> cell, so a click is a lookup, not a scan
        this.dirty = false;

        for (const row of this.data.rows) {
            for (const cell of Object.values(row.cells)) {
                this.cells[cell.item_code] = cell;

                if (cell.d) {
                    this.quantities[cell.item_code] = cell.d;
                }
            }
        }
    }

    find_cell(item_code) {
        return this.cells[item_code];
    }

    render() {
        const customer = this.customer_field.get_value();

        this.$body.find(".od-customer")
            .toggleClass("text-muted", !customer)
            .text(customer || __("Select a customer"));

        this.render_pick_list();
        this.render_table();
        this.render_footer();
        this.apply_search();
    }

    render_pick_list() {
        const { warehouse, pick_lists } = this.data;
        const esc = frappe.utils.escape_html;
        const parts = [];

        if (warehouse) {
            parts.push(`${__("Stock")}: <b>${esc(warehouse)}</b>`);
        }

        if (pick_lists && pick_lists.length) {
            parts.push(
                `${__("Open Pick Lists")}: ` +
                pick_lists
                    .map(({ name, docstatus }) =>
                        `<a href="/app/pick-list/${encodeURIComponent(name)}">${esc(name)}</a>` +
                        (docstatus === 0 ? ` (${__("Draft")})` : "")
                    )
                    .join(", ")
            );
        }

        this.$body.find(".od-pick-list").html(parts.join(" · "));
    }

    render_table() {
        const { sizes, rows } = this.data;

        if (!rows.length) {
            let message = __("No pending Sales Orders for this customer");

            if (!this.customer_field.get_value()) {
                message = __("Select a customer to see their pending orders");
            } else if (!this.warehouse_field.get_value()) {
                message = __("Select a Warehouse Group");
            }

            this.$table.html(`<div class="od-empty text-muted">${message}</div>`);
            return;
        }

        const esc = frappe.utils.escape_html;

        const header = `
            <tr>
                <th class="od-sticky od-col-article">${__("Article")}</th>
                <th class="od-sticky od-col-item">${__("Item")}</th>
                <th class="od-col-mrp">${__("MRP")}</th>
                ${sizes.map((size) => `<th class="od-col-size">${esc(size)}</th>`).join("")}
            </tr>
        `;

        const body = rows.map((row) => {
            const label = this.get_row_label(row);

            const cells = sizes.map((size) => {
                const cell = row.cells[size];
                if (!cell) return `<td class="od-cell od-none"></td>`;

                const d = this.quantities[cell.item_code] || 0;

                return `
                    <td class="od-cell ${this.get_cell_class(cell)}" data-item="${esc(cell.item_code)}"
                        title="${esc(cell.item_code)} · ${__("Click to add 1, right-click to remove 1")}">
                        <span class="od-abc">${this.format_abc(cell)}</span><b class="od-d">${d}</b>
                    </td>
                `;
            }).join("");

            return `
                <tr data-search="${esc(`${row.article} ${label}`.toLowerCase())}">
                    <td class="od-sticky od-col-article">${esc(row.article || "")}</td>
                    <td class="od-sticky od-col-item"><b>${esc(label)}</b></td>
                    <td class="od-col-mrp">${row.mrp ? format_number(row.mrp, null, 0) : ""}</td>
                    ${cells}
                </tr>
            `;
        }).join("");

        this.$table.html(`<table class="od-table"><thead>${header}</thead><tbody>${body}</tbody></table>`);
    }

    // A and B as shown: what is left once D is allocated
    get_shown(cell) {
        const d = flt(this.quantities[cell.item_code]);
        return { a: flt(cell.a) - d, b: flt(cell.b) - d, c: flt(cell.c), d };
    }

    format_abc(cell) {
        const { a, b, c } = this.get_shown(cell);
        return `${flt(a, 3)}|${flt(b, 3)}|${flt(c, 3)}|`;
    }

    // style - colour (colour code), e.g. "BC7012G - ORANGE (101)"; either part may be missing
    get_row_label(row) {
        const colour = [row.colour, row.colour_code && `(${row.colour_code})`].filter(Boolean).join(" ");
        return colour ? `${row.template} - ${colour}` : row.template;
    }

    get_cell_class(cell) {
        const a = flt(cell.a), b = flt(cell.b), c = flt(cell.c);
        const d = flt(this.quantities[cell.item_code]);

        if (a > 0 && d >= a) return "od-planned";
        if (a > 0 && b < a) return "od-short";
        if (a > 0 && b < a + c) return "od-contended";
        // only other customers have ordered this size
        if (a === 0 && c > 0) return "od-contended";
        if (b > 0) return "od-available";
        return "";
    }

    set_cell_class($td, cell) {
        $td.removeClass("od-planned od-short od-contended od-available").addClass(this.get_cell_class(cell));
    }

    render_footer() {
        const qtys = Object.values(this.quantities);
        const total = qtys.reduce((sum, qty) => sum + flt(qty), 0);

        this.$body.find(".od-footer").text(
            this.data.rows.length
                ? __("{0} rows · Allocated: {1} pcs in {2} sizes", [this.data.rows.length, total, qtys.length])
                : ""
        );
    }

    apply_search() {
        const text = (this.search_field.get_value() || "").toLowerCase().trim();

        this.$table.find("tbody tr").each(function () {
            $(this).toggle(!text || this.dataset.search.includes(text));
        });
    }

    save() {
        const customer = this.customer_field.get_value();

        if (!customer) {
            frappe.msgprint(__("Select a customer first"));
            return;
        }

        // every cell, 0 included, so a size taken back down to 0 is dropped
        const quantities = {};
        for (const item_code of Object.keys(this.cells)) {
            quantities[item_code] = this.quantities[item_code] || 0;
        }

        frappe.call({
            method: "ec.api.ordered_dispatch.save_pick_list",
            args: { customer, warehouse: this.warehouse_field.get_value(), quantities },
            freeze: true,
            freeze_message: __("Saving allocation..."),
            callback: (r) => {
                if (!r.message) return;

                const { pick_list, deleted, short } = r.message;
                const short_items = Object.keys(short || {});

                if (pick_list) {
                    frappe.show_alert({ message: __("Pick List {0} saved", [pick_list]), indicator: "green" });
                } else if (deleted.length) {
                    frappe.show_alert({ message: __("Allocation removed"), indicator: "green" });
                } else if (!short_items.length) {
                    frappe.show_alert({ message: __("No changes to save"), indicator: "blue" });
                }

                // not enough stock in the group: allocated what there is
                if (short_items.length) {
                    frappe.show_alert({
                        message: __("Not enough stock, left out: {0}", [
                            short_items.map((item) => `${item} × ${flt(short[item], 3)}`).join(", ")
                        ]),
                        indicator: "orange"
                    }, 10);
                }

                this.refresh(true);
            }
        });
    }

    cancel_allocation() {
        const customer = this.customer_field.get_value();
        const pick_lists = this.data.pick_lists || [];

        if (!customer || !pick_lists.length) {
            frappe.msgprint(__("This customer has no open Pick List"));
            return;
        }

        frappe.confirm(__("Delete the draft and cancel the submitted Pick Lists of {0}?", [customer]), () => {
            frappe.call({
                method: "ec.api.ordered_dispatch.cancel_allocation",
                args: { customer, warehouse: this.warehouse_field.get_value() },
                freeze: true,
                freeze_message: __("Cancelling Pick Lists..."),
                callback: (r) => {
                    if (!r.message) return;

                    const { deleted, cancelled, kept } = r.message;
                    const removed = deleted.concat(cancelled);

                    frappe.show_alert({
                        message: __("Removed: {0}", [removed.join(", ") || __("none")]),
                        indicator: "orange"
                    });

                    if (kept.length) {
                        frappe.msgprint(
                            __("Kept {0}: already partly delivered", [kept.join(", ")])
                        );
                    }

                    this.refresh(true);
                }
            });
        });
    }

    export_csv() {
        const { sizes, rows } = this.data;
        if (!rows.length) return;

        const data = [[__("Article"), __("Item"), __("MRP"), ...sizes]];

        for (const row of rows) {
            data.push([
                row.article,
                this.get_row_label(row),
                row.mrp || "",
                ...sizes.map((size) => {
                    const cell = row.cells[size];
                    if (!cell) return "";
                    const { a, b, c, d } = this.get_shown(cell);
                    return [a, b, c, d].map((v) => flt(v, 3)).join("|");
                })
            ]);
        }

        frappe.tools.downloadify(data, null, `Ordered Dispatch ${this.customer_field.get_value()}`);
    }
};
