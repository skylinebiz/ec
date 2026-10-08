// Copyright (c) 2026, harshit@skylinebiz.in and contributors
// For license information, please see license.txt

const ITEM_SOURCES = [
	{
		label: "Production Lot",
		source_doctype: "EC Lot",
		setters: { date: null },
	},
	{
		label: "Process Lot",
		source_doctype: "EC Process Lot",
		setters: { date: null },
		filters: { docstatus: ["!=", 2] },
	},
	{
		label: "Production Plan",
		source_doctype: "Production Plan",
		setters: { posting_date: null },
		filters: { docstatus: ["!=", 2] },
	},
];

// printer and format are remembered per computer, QZ Tray printers are local
const LOCAL_DEFAULTS = {
	print_format: "ec_barcode_print_format",
	printer: "ec_barcode_printer",
};

frappe.ui.form.on("Barcode Print", {

	setup(frm) {

		frm.set_query("print_format", () => {
			return {
				filters: {
					doc_type: "Barcode Print",
					raw_printing: 1,
					disabled: 0,
				},
			};
		});
	},

	onload(frm) {

		if (!frm.is_new()) return;

		Object.keys(LOCAL_DEFAULTS).forEach((fieldname) => {
			const value = localStorage.getItem(LOCAL_DEFAULTS[fieldname]);

			if (value && !frm.doc[fieldname]) {
				frm.set_value(fieldname, value);
			}
		});
	},

	refresh(frm) {

		ITEM_SOURCES.forEach((source) => {

			if (!frappe.model.can_read(source.source_doctype)) return;

			frm.add_custom_button(
				__(source.label),
				() => get_items_from(frm, source),
				__("Get Items From")
			);
		});

		frm.add_custom_button(__("Select Printer"), () => select_printer(frm));

		frm.add_custom_button(__("Print Barcodes"), () => print_barcodes(frm))
			.addClass("btn-primary");
	},

	print_format(frm) {

		if (frm.doc.print_format) {
			localStorage.setItem(LOCAL_DEFAULTS.print_format, frm.doc.print_format);
		}
	},
});

frappe.ui.form.on("Barcode Print Item", {

	item_code(frm, cdt, cdn) {

		const row = locals[cdt][cdn];

		if (!row.item_code) return;

		return frappe.call({
			method: "ec.api.barcode_print.get_item_label_details",
			args: {
				item_codes: [row.item_code],
			},
		}).then((r) => {
			const details = (r.message || {})[row.item_code];

			if (!details) return;

			return frappe.model.set_value(cdt, cdn, details);
		});
	},

	qty(frm) {
		set_total_labels(frm);
	},

	items_remove(frm) {
		set_total_labels(frm);
	},
});

function set_total_labels(frm) {

	const total = (frm.doc.items || []).reduce((sum, row) => sum + cint(row.qty), 0);

	frm.set_value("total_labels", total);
}

function get_items_from(frm, source) {

	const dialog = new frappe.ui.form.MultiSelectDialog({
		doctype: source.source_doctype,
		target: frm,
		setters: source.setters || {},
		add_filters_group: 1,
		get_query() {
			return {
				filters: source.filters || {},
			};
		},
		action(selections) {

			if (!selections.length) {
				frappe.msgprint(__("Please select at least one {0}", [__(source.label)]));
				return;
			}

			frappe.call({
				method: "ec.api.barcode_print.get_items_from",
				args: {
					source_doctype: source.source_doctype,
					source_names: selections,
				},
				freeze: true,
				freeze_message: __("Fetching items..."),
			}).then((r) => {
				add_source_items(frm, r.message || []);
				dialog.dialog.hide();
			});
		},
	});
}

function add_source_items(frm, items) {

	if (!items.length) {
		frappe.msgprint(__("No items found"));
		return;
	}

	// drop the blank rows left by the grid before appending
	frm.doc.items = (frm.doc.items || []).filter((row) => row.item_code);

	items.forEach((item) => {

		const existing = frm.doc.items.find(
			(row) =>
				row.item_code === item.item_code &&
				row.source_doctype === item.source_doctype &&
				row.source_name === item.source_name
		);

		if (existing) {
			existing.qty = cint(existing.qty) + cint(item.qty);
			return;
		}

		frm.add_child("items", item);
	});

	frm.refresh_field("items");
	set_total_labels(frm);

	frappe.show_alert({
		message: __("{0} item(s) added", [items.length]),
		indicator: "green",
	});
}

function select_printer(frm) {

	return frappe.ui.form.qz_get_printer_list().then((printers) => {

		printers = [].concat(printers || []);

		if (!printers.length) {
			frappe.msgprint(__("No printers found in QZ Tray"));
			return;
		}

		return new Promise((resolve) => {

			const d = new frappe.ui.Dialog({
				title: __("Select Printer"),
				fields: [
					{
						fieldtype: "Select",
						fieldname: "printer",
						label: __("Printer"),
						options: printers,
						default: printers.includes(frm.doc.printer)
							? frm.doc.printer
							: printers[0],
						reqd: 1,
					},
				],
				primary_action_label: __("Select"),
				primary_action(values) {
					d.hide();

					localStorage.setItem(LOCAL_DEFAULTS.printer, values.printer);

					frm.set_value("printer", values.printer)
						.then(() => resolve(values.printer));
				},
			});

			d.show();
		});
	});
}

async function print_barcodes(frm) {

	if (!frm.doc.print_format) {
		frappe.msgprint(__("Please select a Barcode Print Format"));
		return;
	}

	if (!(frm.doc.items || []).some((row) => row.item_code && cint(row.qty) > 0)) {
		frappe.msgprint(__("Please add items with Label Qty"));
		return;
	}

	if (!frm.doc.printer) {
		await select_printer(frm);

		if (!frm.doc.printer) return;
	}

	if (frm.is_dirty()) {
		await frm.save();
	}

	const r = await frappe.call({
		method: "ec.api.barcode_print.get_raw_commands",
		args: {
			name: frm.doc.name,
			print_format: frm.doc.print_format,
		},
		freeze: true,
		freeze_message: __("Preparing labels..."),
	});

	try {

		await frappe.ui.form.qz_connect();

		const config = qz.configs.create(frm.doc.printer);

		for (const commands of r.message || []) {
			await qz.print(config, [commands]);
		}

	} catch (e) {

		// qz_connect reports its own failures and rejects without an error
		if (e) frappe.ui.form.qz_fail(e);

		return;
	}

	frappe.ui.form.qz_success();

	await frappe.call({
		method: "ec.api.barcode_print.mark_printed",
		args: {
			name: frm.doc.name,
		},
	});

	frm.reload_doc();
}
