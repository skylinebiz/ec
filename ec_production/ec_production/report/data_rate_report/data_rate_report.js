// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.query_reports["Data Rate Report"] = {
    filters: [
        {
            fieldname: "effective_date",
            label: __("Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today()
        }
    ]
};
