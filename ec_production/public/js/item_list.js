frappe.listview_settings["Item"] = {
    onload(listview) {
        listview.page.add_inner_button(
            __("Style Creator"),
            () => {
                open_style_creator();
            }
        );
    }
};

function open_style_creator() {

    const d = new frappe.ui.Dialog({
        title: __("Style Creator"),
        size: "extra-large",

        fields: [

            {
                fieldname: "item_group",
                label: "Group Name",
                fieldtype: "Link",
                options: "Item Group",
                reqd: 1
            },

            {
                fieldtype: "Column Break"
            },

            {
                fieldname: "style_no",
                label: "Style No",
                fieldtype: "Data",
                reqd: 1
            },

            {
                fieldname: "variant_details",
                fieldtype: "Section Break",
                label: "Variant Details",
                collapsible: 1
            },

            {
                fieldname: "mrp",
                label: "MRP",
                fieldtype: "Currency"
            },

            {
                fieldname: "wsp",
                label: "WSP",
                fieldtype: "Currency"
            },

            {
                fieldname: "sizes",
                label: "Sizes",
                fieldtype: "Data",
            },

            {
                fieldtype: "Column Break"
            },

            {
                fieldname: "colour",
                label: "Colour",
                fieldtype: "Autocomplete",
                options: [],
            },

            {
                fieldname: "colour_code",
                label: "Colour Code",
                fieldtype: "Data",
                in_list_view: 1
            },

            {
                fieldname: "add_rows",
                label: "Add",
                fieldtype: "Button"
            },

            {
                fieldtype: "Section Break"
            },

            {
                fieldname: "variants",
                label: "Preview",
                fieldtype: "Table",
                cannot_add_rows: false,
                in_place_edit: true,
                data: [],
                fields: [
                    {
                        fieldname: "style_no",
                        label: "Style No",
                        fieldtype: "Data",
                        in_list_view: 1,
                        columns: 2
                    },
                    {
                        fieldname: "colour",
                        label: "Colour",
                        fieldtype: "Data",
                        in_list_view: 1,
                        columns: 2
                    },
                    {
                        fieldname: "colour_code",
                        label: "Colour Code",
                        fieldtype: "Data",
                        in_list_view: 1,
                        columns: 1
                    },
                    {
                        fieldname: "size",
                        label: "Size",
                        fieldtype: "Data",
                        in_list_view: 1,
                        columns: 1
                    },
                    {
                        fieldname: "mrp",
                        label: "MRP",
                        fieldtype: "Currency",
                        in_list_view: 1,
                        columns: 1
                    },
                    {
                        fieldname: "wsp",
                        label: "WSP",
                        fieldtype: "Currency",
                        in_list_view: 1,
                        columns: 1
                    }
                ]
            }
        ],

        primary_action_label: __("Create Style"),

        primary_action: async function () {

            const rows =
                d.fields_dict.variants.df.data || [];

            if (!rows.length) {
                frappe.throw(__("Please add at least one row"));
            }

            // console.log("TABLE DATA", rows);
            const item_group =
                d.get_value("item_group");

            // console.log(item_group);

            const values = d.get_values();

            const btn = d.get_primary_btn();

            d.disable_primary_action();
            btn.text(__("Creating..."));

            try {

                await frappe.call({
                    method: "ec_production.api.item.create_style",
                    args: {
                        item_group: values.item_group,
                        style_no: values.style_no,
                        rows: JSON.stringify(rows)
                    },
                    freeze: true,
                    freeze_message: __("Creating Style...")
                });

                frappe.show_alert({
                    message: __("Style Created"),
                    indicator: "green"
                });

                d.hide();

            } catch (e) {

                frappe.msgprint({
                    title: __("Error"),
                    indicator: "red",
                    message: e.message || __("Failed to create style")
                });

            } finally {

                btn.text(__("Create Style"));
                d.enable_primary_action();

            }
        }
    });

    d.show();

    d.get_field("variant_details").collapse(false);

    setTimeout(() => {

        const wrapper =
            d.fields_dict.variants.$wrapper;

        wrapper.find(".grid-body").css({
            "max-height": "350px",
            "overflow-y": "auto"
        });

    }, 300);

    setTimeout(() => {

        const $input =
            d.fields_dict.style_no.$input;

        const $wrapper =
            $input.parent();

        $wrapper.css("position", "relative");

        $wrapper.append(`
            <span class="style-no-generate"
                style="
                    position:absolute;
                    right:10px;
                    top:50%;
                    transform:translateY(-50%);
                    cursor:pointer;
                    color:var(--primary);
                    z-index:10;">
                <i class="fa fa-refresh"></i>
            </span>
        `);

        $wrapper.find(".style-no-generate").on(
            "click",
            () => load_next_style_no(d)
        );

    }, 100);

    load_colours(d);

    d.fields_dict.style_no.$input.on(
        "click",
        async () => {
            await load_next_style_no(d);
        }
    );

    d.fields_dict.add_rows.$input.on("click", () => {

        const values = d.get_values();

        const missing = [];

        if (!values.colour) missing.push("Colour");
        // if (!values.mrp) missing.push("MRP");
        // if (!values.wsp) missing.push("WSP");
        if (!values.sizes) missing.push("Sizes");
        if (!values.colour_code) missing.push("Colour Code");

        if (missing.length) {

            frappe.throw(`
                    <b>Fields Required:</b>
                    <ul style="margin-top:8px">
                        ${missing.map(f => `<li>${f}</li>`).join("")}
                    </ul>
                `);
        }

        const sizes = parse_sizes(values.sizes);

        if (!sizes.length) {
            frappe.throw(__("Enter valid Sizes"));
        }

        const table = d.fields_dict.variants;

        if (!table.df.data) {
            table.df.data = [];
        }

        const actualWsp =
            flt(values.wsp)
                ? flt(values.mrp) / flt(values.wsp)
                : 0;

        sizes.forEach(size => {

            table.df.data.push({
                style_no: values.style_no,
                colour: colourMap[values.colour] || values.colour,
                colour_code: values.colour_code,
                colour_name: values.colour,
                size,
                mrp: values.mrp,
                wsp: actualWsp
            });

        });

        table.grid.refresh();

        d.set_value("colour", "");
        d.set_value("colour_code", "");
        // d.set_value("sizes", "");
        // d.set_value("wsp", "");
        // d.set_value("mrp", "");
    });
}

let colourMap = {};

async function load_colours(dialog) {

    const r = await frappe.call({
        method: "ec_production.api.item.get_colour_values"
    });

    colourMap = {};

    const colours = (r.message || []).map(row => {

        colourMap[row.colour] = row.abbr;

        return row.colour;
    });

    dialog.fields_dict.colour.set_data(colours);
}

async function load_next_style_no(dialog) {

    const icon =
        dialog.$wrapper.find(".style-no-generate i");

    try {

        icon
            .removeClass("fa-refresh")
            .addClass("fa-spinner fa-spin");

        const r = await frappe.call({
            method: "ec_production.api.item.generate_style_no"
        });

        dialog.set_value(
            "style_no",
            r.message
        );

    } catch (e) {

        frappe.msgprint(
            e.message || __("Failed to generate style no")
        );

    } finally {

        icon
            .removeClass("fa-spinner fa-spin")
            .addClass("fa-refresh");
    }
}

function parse_sizes(value) {

    value = (value || "").trim();

    if (!value) return [];

    if (value.includes("-")) {

        const [start, end] = value
            .split("-")
            .map(Number);

        const result = [];

        for (let i = start; i <= end; i += 2) {
            result.push(String(i));
        }

        return result;
    }

    return value
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
}

async function load_attribute_values(
    dialog,
    attributeField,
    valueField
) {

    const attribute =
        dialog.get_value(attributeField);

    if (!attribute) return;

    const r = await frappe.call({
        method:
            "ec_production.api.item.get_attribute_values",
        args: {
            attribute
        }
    });

    const values = r.message.map(row => ({
        label: row.attribute_value,
        value: row.attribute_value,
        checked: false
    }));

    dialog.fields_dict[valueField].df.options =
        values;

    dialog.fields_dict[valueField].refresh();
}



// function open_advanced_search() {

//     const d = new frappe.ui.Dialog({
//         title: __("Advanced Item Search"),
//         size: "extra-large",
//         fields: [
//             {
//                 fieldtype: "HTML",
//                 fieldname: "search_area"
//             }
//         ],

//         primary_action_label: __("Search"),
//         primary_action(values) {

//             // frappe.call({
//             //     method: "your_app.api.search_items",
//             //     args: values,
//             //     callback(r) {
//             //         if (!r.message) return;

//             //         console.log(r.message);

//             //         // Render results here
//             //     }
//             // });
//         }
//     });

//     d.show();

//     const wrapper = d.fields_dict.search_area.$wrapper;

//     wrapper.html(`
//         <div style="
//             display:grid;
//             grid-template-columns:repeat(8,1fr);
//             gap:8px;
//             align-items:end;
//         ">
//             <div>
//                 <label>Style No</label>
//                 <input class="form-control style-no">
//             </div>
    
//             <div>
//                 <label>Colour</label>
//                 <input class="form-control colour">
//             </div>
    
//             <div>
//                 <label>Colour Code</label>
//                 <input class="form-control colour-code">
//             </div>
    
//             <div>
//                 <label>Size</label>
//                 <input class="form-control size">
//             </div>
    
//             <div>
//                 <label>MRP</label>
//                 <input type="number" class="form-control mrp">
//             </div>
    
//             <div>
//                 <label>WSP</label>
//                 <input type="number" class="form-control wsp">
//             </div>
    
//             <div>
//                 <label>Group Name</label>
//                 <input class="form-control group-name">
//             </div>
    
//             <div>
//                 <button class="btn btn-primary search-btn">
//                     Search
//                 </button>
//             </div>
//         </div>
    
//         <div class="search-results mt-4"></div>
//     `);

//     wrapper.find(".search-btn").on("click", () => {

//         frappe.call({
//             method: "ec_production.api.item.search_items",
//             args: {
//                 style_no: wrapper.find(".style-no").val(),
//                 colour: wrapper.find(".colour").val(),
//                 colour_code: wrapper.find(".colour-code").val(),
//                 size: wrapper.find(".size").val(),
//                 mrp: wrapper.find(".mrp").val(),
//                 wsp: wrapper.find(".wsp").val(),
//                 group_name: wrapper.find(".group-name").val(),
//             },
//             callback(r) {

//                 const items = r.message || [];

//                 let html = `
//                 <table class="table table-bordered">
//                     <thead>
//                         <tr>
//                             <th>Item</th>
//                             <th>Colour</th>
//                             <th>Size</th>
//                             <th>MRP</th>
//                             <th>WSP</th>
//                             <th width="120">Qty</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//             `;

//                 items.forEach(item => {

//                     html += `
//                     <tr data-item="${item.name}">
//                         <td>${item.item_name || item.name}</td>
    
//                         <td>${item.colour || ""}</td>
//                         <td>${item.size || ""}</td>
//                         <td>${item.mrp || ""}</td>
//                         <td>${item.wsp || ""}</td>
//                         <td>
//                             <input
//                                 type="number"
//                                 min="0"
//                                 value="0"
//                                 class="form-control qty-input"
//                             >
//                         </td>
//                     </tr>
//                 `;
//                 });

//                 html += `
//                     </tbody>
//                 </table>

//                 <div class="text-right">
//                     <button class="btn btn-primary add-selected-items">
//                         Add Items
//                     </button>
//                 </div>
//             `;

//                 wrapper.find(".search-results").html(html);
//             }
//         });

//     });

//     wrapper.on("click", ".add-selected-items", () => {

//         wrapper.find("tbody tr").each(function () {

//             const qty = cint(
//                 $(this).find(".qty-input").val()
//             );

//             if (!qty) return;

//             const item_code =
//                 $(this).attr("data-item");

//             cur_frm.add_child("items", {
//                 item_code,
//                 qty
//             });
//         });

//         cur_frm.refresh_field("items");

//         frappe.show_alert({
//             message: __("Items Added"),
//             indicator: "green"
//         });
//     });
// }