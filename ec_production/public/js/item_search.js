frappe.listview_settings["Item"] = {
    onload(listview) {
        listview.page.add_inner_button(
            __("Advanced Search"),
            () => {
                open_advanced_search();
            }
        );
    }
};


function open_style_creator() {

    const d = new frappe.ui.Dialog({
        title: __("Advanced Item Search"),
        size: "extra-large",
        // fields: [
        //     {
        //         fieldname: "style_no",
        //         label: __("Style No"),
        //         fieldtype: "Data",
        //     },
        //     {
        //         fieldname: "colour",
        //         label: __("Colour"),
        //         fieldtype: "Data",
        //     },
        //     {
        //         fieldname: "colour_code",
        //         label: __("Colour Code"),
        //         fieldtype: "Data",
        //     },
        //     {
        //         fieldname: "size",
        //         label: __("Size"),
        //         fieldtype: "Data",
        //     },
        //     {
        //         fieldname: "mrp",
        //         label: __("MRP"),
        //         fieldtype: "Currency",
        //     },
        //     {
        //         fieldname: "wsp",
        //         label: __("WSP"),
        //         fieldtype: "Currency",
        //     },
        //     {
        //         fieldname: "group_name",
        //         label: __("Group Name"),
        //         fieldtype: "Data",
        //     }
        // ],

        fields: [
            {
                fieldtype: "HTML",
                fieldname: "search_area"
            }
        ],

        primary_action_label: __("Search"),
        primary_action(values) {

            // frappe.call({
            //     method: "your_app.api.search_items",
            //     args: values,
            //     callback(r) {
            //         if (!r.message) return;

            //         console.log(r.message);

            //         // Render results here
            //     }
            // });
        }
    });

    d.show();

    const wrapper = d.fields_dict.search_area.$wrapper;

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
                <input type="number" class="form-control mrp">
            </div>
    
            <div>
                <label>WSP</label>
                <input type="number" class="form-control wsp">
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

    wrapper.find(".search-btn").on("click", () => {

        frappe.call({
            method: "your_app.api.search_items",
            args: {
                style_no: wrapper.find(".style-no").val(),
                colour: wrapper.find(".colour").val(),
                colour_code: wrapper.find(".colour-code").val(),
                size: wrapper.find(".size").val(),
                mrp: wrapper.find(".mrp").val(),
                wsp: wrapper.find(".wsp").val(),
                group_name: wrapper.find(".group-name").val(),
            },
            callback(r) {

                const items = r.message || [];

                let html = `
                <table class="table table-bordered">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Style No</th>
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
                    <tr data-item="${item.name}">
                        <td>${item.item_name || item.name}</td>
                        <td>${item.style_no || ""}</td>
                        <td>${item.colour || ""}</td>
                        <td>${item.size || ""}</td>
                        <td>${item.mrp || ""}</td>
                        <td>${item.wsp || ""}</td>
                        <td>
                            <input
                                type="number"
                                min="0"
                                value="0"
                                class="form-control qty-input"
                            >
                        </td>
                    </tr>
                `;
                });

                html += `
                    </tbody>
                </table>

                <div class="text-right">
                    <button class="btn btn-primary add-selected-items">
                        Add Items
                    </button>
                </div>
            `;

                wrapper.find(".search-results").html(html);
            }
        });

    });

    wrapper.on("click", ".add-selected-items", () => {

        wrapper.find("tbody tr").each(function () {

            const qty = cint(
                $(this).find(".qty-input").val()
            );

            if (!qty) return;

            const item_code =
                $(this).attr("data-item");

            cur_frm.add_child("items", {
                item_code,
                qty
            });
        });

        cur_frm.refresh_field("items");

        frappe.show_alert({
            message: __("Items Added"),
            indicator: "green"
        });
    });

}