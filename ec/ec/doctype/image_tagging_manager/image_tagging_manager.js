// Copyright (c) 2026, harshit@skylinebiz.in and contributors
// For license information, please see license.txt

const MODE_DESCRIPTIONS = {
	Retain: __("Keep the item's existing image/attachments and add these alongside them."),
	Override: __("Remove the item's existing image and attachments first, then apply only these.")
};

frappe.ui.form.on("Image Tagging Manager", {

	onload(frm) {

		frm.set_query("item", () => ({
			filters: { has_variants: 1 }
		}));
	},

	refresh(frm) {

		render_search_ui(frm);
		render_images_gallery(frm);
		render_logs(frm);
		set_mode_description(frm);

		// Frappe already shows Save (draft/dirty) or Submit (saved &
		// clean) as the primary action on its own - just relabel the
		// Submit case to "Process" and let it run the normal submit
		// flow (before_submit/on_submit do the actual work).
		if (
			frm.doc.docstatus === 0
			&& !frm.is_new()
			&& !frm.is_dirty()
		) {
			frm.page.set_primary_action(__("Process"), () => frm.savesubmit());
		}
	},

	mode(frm) {
		set_mode_description(frm);
	},

	item(frm) {
		render_search_ui(frm);
	}
});

frappe.ui.form.on("Image Tagging Manager Image", {

	is_primary(frm, cdt, cdn) {

		// only one row can be Primary at a time
		const row = frappe.get_doc(cdt, cdn);

		if (!row.is_primary) return;

		(frm.doc.images || []).forEach(d => {
			if (d.name !== cdn && d.is_primary) {
				frappe.model.set_value(d.doctype, d.name, "is_primary", 0);
			}
		});
	}
});

function set_mode_description(frm) {

	frm.set_df_property("mode", "description", MODE_DESCRIPTIONS[frm.doc.mode] || "");
	frm.refresh_field("mode");
}

async function render_search_ui(frm) {

	const field = frm.get_field("search_html");

	if (!field) return;

	const wrapper = field.$wrapper;

	// drop any handlers from a previous render - otherwise clicks
	// fire once per past render (each click removes/searches N times)
	wrapper.off("click");

	const editable = frm.doc.docstatus === 0;

	if (!frm.doc.item) {
		wrapper.html(
			`<div class="text-muted">${__("Select an Item first")}</div>`
		);
		return;
	}

	const render_matched = () => {

		const matched = frm.doc.matched_items || [];

		if (!matched.length) {

			wrapper.find(".matched-list").html(
				`<div class="text-muted">${__("No item variants selected yet")}</div>`
			);

			return;
		}

		const html = matched.map((v, idx) => `
			<div style="
				display:flex;
				justify-content:space-between;
				align-items:center;
				padding:6px 10px;
				border:1px solid var(--border-color);
				border-radius:var(--border-radius);
				margin-bottom:6px;
			">
				<div>
					<b>${frappe.utils.escape_html(v.item_code)}</b>
					<span class="text-muted" style="margin-left:8px;">
						${frappe.utils.escape_html(v.details || "")}
					</span>
				</div>

				${editable ? `
					<button
						class="btn btn-xs btn-danger remove-matched-btn"
						data-idx="${idx}"
					>×</button>
				` : ""}
			</div>
		`).join("");

		wrapper.find(".matched-list").html(html);
	};

	if (!editable) {

		wrapper.html(`<div class="matched-list"></div>`);
		render_matched();
		return;
	}

	const attributes = await frappe.xcall("ec.api.item.get_item_attributes");

	wrapper.html(`
		<div class="attribute-search-fields" style="
			display:flex;
			flex-wrap:wrap;
			gap:10px;
			margin-bottom:10px;
			align-items:end;
		"></div>

		<button class="btn btn-sm btn-primary search-variants-btn">
			${__("Search")}
		</button>

		<div class="matched-list mt-3"></div>
	`);

	const fields_wrapper = wrapper.find(".attribute-search-fields");

	const controls = attributes.map(a => {

		const $box = $(`
			<div style="min-width:160px;">
				<label style="font-size:12px;">
					${frappe.utils.escape_html(a.name)}
				</label>
				<div class="attr-control"></div>
			</div>
		`);

		fields_wrapper.append($box);

		const control = frappe.ui.form.make_control({
			parent: $box.find(".attr-control"),
			render_input: true,
			only_input: true,
			df: {
				fieldtype: "Autocomplete",
				fieldname: frappe.scrub(a.name),
				placeholder: a.name
			}
		});

		control.refresh();

		frappe.call({
			method: "ec.api.item.get_attribute_values",

			args: { attribute: a.name },

			callback: (r) => {
				control.df.options = (r.message || []).map(d => d.attribute_value);
				control.set_options && control.set_options();
			}
		});

		return { attribute: a.name, control };
	});

	render_matched();

	wrapper.on("click", ".search-variants-btn", () => {

		const attribute_filters = controls
			.map(c => ({
				attribute: c.attribute,
				attribute_value: c.control.get_value()?.trim()
			}))
			.filter(a => a.attribute_value);

		frappe.call({
			method: "ec.api.item_catalogue.get_matching_variants",

			args: {
				item: frm.doc.item,
				attributes: attribute_filters
			},

			callback: (r) => {

				const found = r.message || [];

				// clear the search fields either way, ready for the next search
				controls.forEach(c => c.control.set_value(""));

				if (!found.length) {
					frappe.msgprint(
						__("No matching item variant found for this combination")
					);
					return;
				}

				let added = 0;

				found.forEach(v => {

					if ((frm.doc.matched_items || []).some(m => m.item_code === v.item_code)) {
						return;
					}

					const row = frm.add_child("matched_items");

					row.item_code = v.item_code;
					row.details = Object.entries(v.attributes || {})
						.map(([k, val]) => `${k}: ${val}`)
						.join(", ");

					added++;
				});

				frm.refresh_field("matched_items");
				render_matched();

				if (!added) {
					frappe.msgprint(
						__("All matching variants have already been added")
					);
				}
			}
		});
	});

	wrapper.on("click", ".remove-matched-btn", function () {

		const idx = cint($(this).attr("data-idx"));
		const row = (frm.doc.matched_items || [])[idx];

		if (!row) return;

		// same hidden-table caveat as images - go through the model,
		// not the (never-initialised) grid API
		frm.doc.matched_items = frm.doc.matched_items.filter(d => d.name !== row.name);

		frm.dirty();
		frm.refresh_field("matched_items");

		render_matched();
	});
}

function render_images_gallery(frm) {

	const field = frm.get_field("images_html");

	if (!field) return;

	const wrapper = field.$wrapper;

	wrapper.off("click change");

	const images = frm.doc.images || [];
	const editable = frm.doc.docstatus === 0;

	const cards = images.map((row, idx) => `
		<div style="text-align:center; width:110px;">
			<div style="position:relative;">
				<img
					src="${row.image}"
					style="
						width:100px;
						height:100px;
						object-fit:cover;
						border-radius:4px;
						border:1px solid var(--border-color);
						display:block;
					"
				>
				${editable ? `
					<button
						class="btn btn-xs btn-danger remove-image-btn"
						data-idx="${idx}"
						style="
							position:absolute;
							top:-8px;
							right:-4px;
							border-radius:50%;
							width:20px;
							height:20px;
							padding:0;
							line-height:1;
						"
					>×</button>
				` : ""}
			</div>
			<label style="
				display:block;
				font-size:11px;
				font-weight:normal;
				margin-top:4px;
			">
				<input
					type="radio"
					name="primary_image"
					value="${idx}"
					${row.is_primary ? "checked" : ""}
					${editable ? "" : "disabled"}
				>
				${__("Primary")}
			</label>
		</div>
	`).join("");

	wrapper.html(`
		<div class="image-gallery-cards" style="
			display:flex;
			flex-wrap:wrap;
			gap:14px;
			margin-bottom:12px;
		">
			${cards || `<div class="text-muted">${__("No images uploaded yet")}</div>`}
		</div>

		${editable ? `
			<button class="btn btn-sm btn-secondary upload-image-btn">
				${__("Upload Image")}
			</button>
			${images.some(d => d.is_primary) ? `
				<button class="btn btn-sm btn-default clear-primary-btn">
					${__("Clear Primary")}
				</button>
			` : ""}
		` : ""}
	`);

	if (!editable) return;

	wrapper.on("change", "input[name=primary_image]", function () {

		const selected_idx = cint($(this).val());

		images.forEach((row, i) => {
			frappe.model.set_value(
				row.doctype,
				row.name,
				"is_primary",
				i === selected_idx ? 1 : 0,
				"Check",
				true
			);
		});

		// re-render so the Clear Primary button's visibility
		// (computed at render time) reflects the new selection
		render_images_gallery(frm);
	});

	wrapper.on("click", ".clear-primary-btn", () => {

		images.forEach(row => {
			if (row.is_primary) {
				frappe.model.set_value(row.doctype, row.name, "is_primary", 0, "Check", true);
			}
		});

		render_images_gallery(frm);
	});

	wrapper.on("click", ".remove-image-btn", function () {

		const idx = cint($(this).attr("data-idx"));
		const row = images[idx];

		if (!row) return;

		// The images table is a hidden field, so its Grid never
		// finishes initialising (frappe.perm.get_field_display_status
		// returns "None" for hidden fields, and Grid.refresh() bails
		// out before populating grid_rows_by_docname) - going through
		// grid.grid_rows_by_docname[...].remove() is always a no-op
		// here. Remove the row from the model directly instead.
		frm.doc.images = frm.doc.images.filter(d => d.name !== row.name);

		frm.dirty();
		frm.refresh_field("images");

		render_images_gallery(frm);
	});

	wrapper.on("click", ".upload-image-btn", () => {

		frappe.call({
			method: "ec.api.item_catalogue.get_tagging_manager_folder",

			callback: (r) => {

				new frappe.ui.FileUploader({
					folder: r.message,
					allow_multiple: true,
					restrictions: {
						allowed_file_types: ["image/*"]
					},
					on_success: (file_doc) => {

						const row = frm.add_child("images");

						row.image = file_doc.file_url;
						row.is_primary = frm.doc.images.length === 1 ? 1 : 0;

						frm.refresh_field("images");
						render_images_gallery(frm);
					}
				});
			}
		});
	});
}

function render_logs(frm) {

	const field = frm.get_field("logs_html");

	if (!field) return;

	const wrapper = field.$wrapper;

	const log = frm.doc.log || [];

	if (!log.length) {
		wrapper.html(
			`<div class="text-muted">${__("Nothing applied yet")}</div>`
		);
		return;
	}

	const rows = log.map(d => {

		const verb = d.action === "Linked" ? __("linked with") : __("unlinked from");
		const color = d.status === "Success" ? "var(--text-color)" : "var(--red-500, #d33)";

		return `
			<div style="padding:4px 0; border-bottom:1px solid var(--border-color); color:${color};">
				${frappe.utils.escape_html(d.file_url || "")}
				${verb}
				<b>${frappe.utils.escape_html(d.item_code)}</b>
				&mdash; ${d.status}
				${d.remarks ? `<div class="text-muted" style="font-size:11px;">${frappe.utils.escape_html(d.remarks)}</div>` : ""}
			</div>
		`;
	}).join("");

	wrapper.html(`
		<div style="margin-bottom:6px;">
			<b>${__("Mode")}:</b> ${frappe.utils.escape_html(frm.doc.mode || "")}
		</div>
		${rows}
	`);
}
