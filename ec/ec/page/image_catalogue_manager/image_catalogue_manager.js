frappe.provide("ec");

frappe.pages["image-catalogue-manager"].on_page_load = function (wrapper) {

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Image Catalogue Manager"),
		single_column: true
	});

	new ec.ImageCatalogueManager(page);
};

ec.ImageCatalogueManager = class ImageCatalogueManager {

	constructor(page) {

		this.page = page;
		this.wrapper = $(page.body);

		// file_url -> file_doc, of currently checked gallery cards
		this.selected = new Map();

		this.make();
		this.make_toolbar();
		this.load_images();
	}

	make() {

		this.wrapper.html(`
			<style>
				.image-catalogue-card {
					position:relative;
					border:1px solid var(--border-color);
					border-radius:var(--border-radius);
					overflow:hidden;
					transition:box-shadow .15s ease;
				}
				.image-catalogue-card:hover {
					box-shadow:0 2px 10px rgba(0,0,0,.12);
				}
				.image-catalogue-card.selected {
					box-shadow:0 0 0 2px var(--primary);
				}
				.catalogue-select-toggle {
					position:absolute;
					top:8px;
					left:8px;
					z-index:2;
					width:22px;
					height:22px;
					border-radius:50%;
					background:rgba(255,255,255,.95);
					border:1.5px solid rgba(0,0,0,.3);
					cursor:pointer;
					display:flex;
					align-items:center;
					justify-content:center;
					transition:background .15s ease, border-color .15s ease;
				}
				.catalogue-select-toggle svg {
					width:13px;
					height:13px;
					display:none;
				}
				.image-catalogue-card.selected .catalogue-select-toggle {
					background:var(--primary);
					border-color:var(--primary);
				}
				.image-catalogue-card.selected .catalogue-select-toggle svg {
					display:block;
				}
			</style>

			<div class="image-catalogue-manager" style="padding:20px 24px;">
				<div class="image-catalogue-gallery" style="
					display:grid;
					grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));
					gap:16px;
					margin-top:16px;
				"></div>
			</div>
		`);

		this.gallery = this.wrapper.find(".image-catalogue-gallery");
	}

	make_toolbar() {

		this.page.set_primary_action(
			__("Upload Images"),
			() => this.upload_images(),
			"upload"
		);

		this.tag_btn = this.page.add_button(
			__("Tag Selected"),
			() => this.open_tag_dialog()
		);

		this.update_tag_button();
	}

	update_tag_button() {

		const count = this.selected.size;

		this.tag_btn
			.prop("disabled", count === 0)
			.text(
				count
					? __("Tag Selected ({0})", [count])
					: __("Tag Selected")
			);
	}

	load_images() {

		frappe.call({
			method: "ec.api.item_catalogue.list_catalogue_images",

			callback: (r) => {

				(r.message || []).forEach(file_doc => {
					this.render_card(file_doc);
				});
			}
		});
	}

	upload_images() {

		frappe.call({
			method: "ec.api.item_catalogue.get_catalogue_folder",

			callback: (r) => {

				new frappe.ui.FileUploader({
					folder: r.message,
					allow_multiple: true,
					restrictions: {
						allowed_file_types: ["image/*"]
					},
					on_success: (file_doc) => {
						// newest upload goes on top
						this.render_card(file_doc, true);
					}
				});
			}
		});
	}

	render_card(file_doc, prepend = false) {

		const $card = $(`
			<div class="image-catalogue-card">
				<div class="catalogue-select-toggle">
					<svg viewBox="0 0 24 24" fill="none" stroke="#fff"
						stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
				</div>
				<img
					src="${file_doc.file_url}"
					style="
						width:100%;
						height:160px;
						object-fit:cover;
						display:block;
					"
				>
				<div class="image-catalogue-card-body" style="
					padding:6px 8px;
				">
					<div style="
						font-size:12px;
						color:var(--text-muted);
						white-space:nowrap;
						overflow:hidden;
						text-overflow:ellipsis;
					">
						${frappe.utils.escape_html(file_doc.file_name)}
					</div>
				</div>
			</div>
		`);

		$card.find(".catalogue-select-toggle").on("click", () => {
			this.toggle_selection(file_doc, $card);
		});

		if (prepend) {
			this.gallery.prepend($card);
		} else {
			this.gallery.append($card);
		}

		return $card;
	}

	toggle_selection(file_doc, $card) {

		const selected = $card.toggleClass("selected").hasClass("selected");

		if (selected) {
			this.selected.set(file_doc.file_url, file_doc);
		} else {
			this.selected.delete(file_doc.file_url);
		}

		this.update_tag_button();
	}

	clear_selection() {

		this.gallery.find(".image-catalogue-card").removeClass("selected");

		this.selected.clear();

		this.update_tag_button();
	}

	async open_tag_dialog() {

		const files = [...this.selected.values()];

		if (!files.length) return;

		const tags = [];

		const [colours, colour_codes, linked_per_file] = await Promise.all([
			frappe.xcall("ec.api.item.get_attribute_values", {
				attribute: "Colour"
			}),
			frappe.xcall("ec.api.item.get_attribute_values", {
				attribute: "Colour Code"
			}),
			Promise.all(
				files.map(f =>
					frappe.xcall("ec.api.item_catalogue.get_linked_items", {
						file_url: f.file_url
					})
				)
			)
		]);

		const d = new frappe.ui.Dialog({
			title: __("Tag Images"),
			size: "large",
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "content"
				}
			],
			primary_action_label: __("Apply to Items"),
			primary_action: () => {

				const item_codes = [
					...new Set(tags.map(t => t.variant))
				];

				if (!item_codes.length) {

					frappe.msgprint(
						__("Add at least one tag that matches existing item variants")
					);

					return;
				}

				// empty value = "keep existing primary" was chosen
				const primary_file_url = wrapper
					.find("input[name=primary_file]:checked")
					.val();

				const secondary_file_urls = files
					.map(f => f.file_url)
					.filter(url => url !== primary_file_url);

				const mode = wrapper
					.find("input[name=apply_mode]:checked")
					.val();

				const args = {
					secondary_file_urls,
					item_codes,
					mode
				};

				// only send primary_file_url when one was actually chosen
				if (primary_file_url) {
					args.primary_file_url = primary_file_url;
				}

				frappe.call({
					method: "ec.api.item_catalogue.assign_catalogue_images",

					args,

					callback: (r) => {

						const result = r.message || {};

						frappe.show_alert({
							message: __(
								"Images applied to {0} item(s)",
								[(result.updated || []).length]
							),
							indicator: "green"
						});

						this.clear_selection();

						d.hide();
					}
				});
			}
		});

		d.show();

		const wrapper = d.fields_dict.content.$wrapper;

		wrapper.html(`
			<div class="tag-files-strip" style="
				display:flex;
				gap:14px;
				margin-bottom:12px;
				overflow-x:auto;
				padding-bottom:4px;
			"></div>

			<div class="apply-mode" style="margin-bottom:16px;">
				<label style="margin-right:20px; font-weight:normal;">
					<input type="radio" name="apply_mode" value="retain" checked>
					${__("Retain")}
					<span class="text-muted" style="font-size:11px;">
						(${__("keep existing, add these alongside")})
					</span>
				</label>
				<label style="font-weight:normal;">
					<input type="radio" name="apply_mode" value="override">
					${__("Override")}
					<span class="text-muted" style="font-size:11px;">
						(${__("remove existing, keep only these")})
					</span>
				</label>
			</div>

			<div style="
				display:grid;
				grid-template-columns:2fr 1fr 1fr auto;
				gap:8px;
				align-items:end;
			">
				<div>
					<label>${__("Item Code")}</label>
					<div class="tag-item-code-field"></div>
				</div>

				<div>
					<label>${__("Colour")}</label>
					<div class="tag-colour-field"></div>
				</div>

				<div>
					<label>${__("Colour Code")}</label>
					<div class="tag-colour-code-field"></div>
				</div>

				<div>
					<button class="btn btn-default btn-sm add-tag-btn">
						${__("Add")}
					</button>
				</div>
			</div>

			<div class="tag-list mt-3"></div>
		`);

		wrapper.find(".tag-files-strip").html(
			files.map((f, idx) => `
				<div style="text-align:center; flex:0 0 auto; width:80px;">
					<img
						src="${f.file_url}"
						style="
							width:70px;
							height:70px;
							object-fit:cover;
							border-radius:4px;
							display:block;
							margin:0 auto;
						"
					>
					<label style="
						display:block;
						font-size:11px;
						font-weight:normal;
						margin-top:4px;
					">
						<input
							type="radio"
							name="primary_file"
							value="${f.file_url}"
							${idx === 0 ? "checked" : ""}
						>
						${__("Primary")}
					</label>
					<div class="text-muted" style="font-size:10px;">
						${linked_per_file[idx].length
							? __("Linked: {0}", [linked_per_file[idx].length])
							: __("Not linked")}
					</div>
				</div>
			`).join("")
			+ `
				<div style="
					text-align:center;
					flex:0 0 auto;
					width:80px;
				">
					<div style="
						width:70px;
						height:70px;
						margin:0 auto;
						border:1px dashed var(--border-color);
						border-radius:4px;
						display:flex;
						align-items:center;
						justify-content:center;
						font-size:10px;
						color:var(--text-muted);
						padding:4px;
					">
						${__("Existing cover")}
					</div>
					<label style="
						display:block;
						font-size:11px;
						font-weight:normal;
						margin-top:4px;
					">
						<input type="radio" name="primary_file" value="">
						${__("Keep as primary")}
					</label>
				</div>
			`
		);

		const item_code_control = frappe.ui.form.make_control({
			parent: wrapper.find(".tag-item-code-field"),
			render_input: true,
			only_input: true,
			df: {
				fieldtype: "Link",
				options: "Item",
				fieldname: "item_code",
				placeholder: __("Item Code"),
				get_query: () => ({
					filters: { has_variants: 1 }
				})
			}
		});

		const colour_control = frappe.ui.form.make_control({
			parent: wrapper.find(".tag-colour-field"),
			render_input: true,
			only_input: true,
			df: {
				fieldtype: "Autocomplete",
				fieldname: "colour",
				placeholder: __("Colour"),
				options: colours.map(d => d.attribute_value)
			}
		});

		const colour_code_control = frappe.ui.form.make_control({
			parent: wrapper.find(".tag-colour-code-field"),
			render_input: true,
			only_input: true,
			df: {
				fieldtype: "Autocomplete",
				fieldname: "colour_code",
				placeholder: __("Colour Code"),
				options: colour_codes.map(d => d.attribute_value)
			}
		});

		item_code_control.refresh();
		colour_control.refresh();
		colour_code_control.refresh();

		// tags: one row per matched SIZE variant, each individually removable
		const render_tags = () => {

			if (!tags.length) {

				wrapper.find(".tag-list").html(
					`<div class="text-muted">${__("No tags added yet")}</div>`
				);

				return;
			}

			const html = tags.map((t, idx) => `
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
						<b>
							${frappe.utils.escape_html(t.item_code)}
							- ${frappe.utils.escape_html(t.colour)}
							- ${frappe.utils.escape_html(t.colour_code)}
						</b>

						<span class="text-muted" style="margin-left:8px;">
							${t.size
								? __("Size {0}", [frappe.utils.escape_html(t.size)])
								: frappe.utils.escape_html(t.variant)}
						</span>
					</div>

					<button
						class="btn btn-xs btn-danger remove-tag-btn"
						data-idx="${idx}"
					>×</button>
				</div>
			`).join("");

			wrapper.find(".tag-list").html(html);
		};

		render_tags();

		wrapper.on("click", ".add-tag-btn", () => {

			const item_code = item_code_control.get_value()?.trim();
			const colour = colour_control.get_value()?.trim();
			const colour_code = colour_code_control.get_value()?.trim();

			if (!item_code || !colour || !colour_code) {

				frappe.msgprint(
					__("Please enter Item Code, Colour and Colour Code")
				);

				return;
			}

			frappe.call({
				method: "ec.api.item_catalogue.get_variants_for_tag",

				args: {
					item_code,
					colour,
					colour_code
				},

				callback: (r) => {

					const variants = r.message || [];

					if (!variants.length) {

						frappe.msgprint(
							__("No matching item variant found for this combination")
						);

						return;
					}

					let added = 0;

					variants.forEach(v => {

						// don't add the same size variant twice
						if (tags.some(t => t.variant === v.item_code)) {
							return;
						}

						tags.push({
							item_code,
							colour,
							colour_code,
							size: v.size,
							variant: v.item_code
						});

						added++;
					});

					render_tags();

					if (!added) {

						frappe.msgprint(
							__("All matching sizes have already been added")
						);
					}

					item_code_control.set_value("");
					colour_control.set_value("");
					colour_code_control.set_value("");
				}
			});
		});

		wrapper.on("click", ".remove-tag-btn", function () {

			const idx = cint($(this).attr("data-idx"));

			tags.splice(idx, 1);

			render_tags();
		});
	}
};
