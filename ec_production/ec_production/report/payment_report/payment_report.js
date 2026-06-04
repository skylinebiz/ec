// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.query_reports["Payment Report"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From"),
            fieldtype: "Date",
            reqd: 1,
            default: frappe.datetime.month_start()
        },
        {
            fieldname: "to_date",
            label: __("To"),
            fieldtype: "Date",
            reqd: 1,
            default: frappe.datetime.month_end()
        }
    ],

    formatter(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (column.fieldname === "employee" && data) {
            return `
                <a href="javascript:void(0)"
                onclick="open_voucher_report(
                        '${data.employee_id}',
                        '${frappe.query_report.get_filter_value('from_date')}',
                        '${frappe.query_report.get_filter_value('to_date')}'
                )">
                    ${value}
                </a>
            `;
        }

        return value;
    }
};

window.open_voucher_report = function (employee, from_date, to_date) {

    frappe.route_options = {
        employee: employee,
        from_date: from_date,
        to_date: to_date
    };

    frappe.set_route("query-report", "Voucher Report");
};