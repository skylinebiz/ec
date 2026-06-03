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
    ]
};
