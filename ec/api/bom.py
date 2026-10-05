import frappe
from frappe import _

SIZE_ATTRIBUTE = "Size"
CUT_SIZE = "CUT"


@frappe.whitelist()
def get_style_sizes(item):

    current_size, variants = get_size_variants(item)

    if not current_size:
        return {}

    variants.pop(CUT_SIZE, None)

    default_boms = {}
    item_names = {}

    if variants:

        item_names = dict(
            frappe.get_all(
                "Item",
                filters={
                    "name": ["in", list(variants.values())]
                },
                fields=["name", "item_name"],
                as_list=True
            )
        )

        default_boms = dict(
            frappe.get_all(
                "BOM",
                filters={
                    "item": ["in", list(variants.values())],
                    "is_default": 1,
                    "is_active": 1,
                    "docstatus": 1
                },
                fields=["item", "name"],
                as_list=True
            )
        )

    return {
        "size": current_size,
        "sizes": [
            {
                "size": size,
                "item_code": variants[size],
                "item_name": item_names.get(variants[size]) or variants[size],
                "default_bom": default_boms.get(variants[size])
            }
            for size in sorted(variants, key=size_sort_key)
        ]
    }


@frappe.whitelist()
def clone_style_bom(bom, items):

    if isinstance(items, str):
        items = frappe.parse_json(items)

    if not items:
        frappe.throw(_("Please select at least one size"))

    source = frappe.get_doc("BOM", bom)
    source.check_permission("read")

    current_size, variants = get_size_variants(source.item)
    variants.pop(CUT_SIZE, None)

    sizes = {
        item_code: size
        for size, item_code in variants.items()
    }

    row_variants = {
        row.item_code: get_size_variants(row.item_code)
        for row in source.items
    }

    created = []

    for item_code in items:

        size = sizes.get(item_code)

        if not size:
            frappe.throw(
                _("Item {0} is not a size of {1}").format(
                    item_code,
                    source.item
                )
            )

        doc = frappe.copy_doc(source)

        doc.update({
            "item": item_code,
            "item_name": None,
            "description": None,
            "image": None,
            "bom_creator": None,
            "bom_creator_item": None
        })

        # Raw materials of the source size move to the same size
        for row in doc.items:

            row_size, siblings = row_variants[row.item_code]

            if row_size != current_size or size not in siblings:
                continue

            row.update({
                "item_code": siblings[size],
                "item_name": None,
                "description": None,
                "image": None,
                "bom_no": None
            })

        doc.insert()
        doc.submit()

        created.append({
            "size": size,
            "item_code": item_code,
            "bom": doc.name
        })

    return created


def get_size_variants(item):
    """Returns the Size of `item` and {size: item_code} for the
    other variants of its template which differ only by Size."""

    variant_of = frappe.db.get_value("Item", item, "variant_of")

    if not variant_of:
        return None, {}

    enabled = set(
        frappe.get_all(
            "Item",
            filters={
                "variant_of": variant_of,
                "disabled": 0
            },
            pluck="name"
        )
    )

    attributes = {}

    for d in frappe.get_all(
        "Item Variant Attribute",
        filters={
            "variant_of": variant_of,
            "parenttype": "Item"
        },
        fields=["parent", "attribute", "attribute_value"]
    ):
        attributes.setdefault(d.parent, {})[d.attribute] = d.attribute_value

    current = dict(attributes.get(item) or {})
    current_size = current.pop(SIZE_ATTRIBUTE, None)

    if not current_size:
        return None, {}

    variants = {}

    for variant, attrs in attributes.items():

        if variant == item or variant not in enabled:
            continue

        attrs = dict(attrs)
        size = attrs.pop(SIZE_ATTRIBUTE, None)

        if size and size != current_size and attrs == current:
            variants[size] = variant

    return current_size, variants


def size_sort_key(size):

    try:
        return (0, float(size), "")
    except ValueError:
        return (1, 0, size)
