// Copyright (c) 2026, SkylineBiz Private Limited and contributors
// For license information, please see license.txt

frappe.query_reports["Voucher Report"] = {
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
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee"
		}
	],

	onload: function (report) {
		if (frappe.route_options) {
			report.set_filter_value("employee", frappe.route_options.employee);
			report.set_filter_value("from_date", frappe.route_options.from_date);
			report.set_filter_value("to_date", frappe.route_options.to_date);

			frappe.route_options = null;

			report.refresh();
		}
	}
};