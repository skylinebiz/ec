import frappe
from frappe.core.api.file import create_new_folder

CATALOGUE_FOLDER = "Home/Item Catalogue Images"

IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]


def ensure_catalogue_folder():

    if not frappe.db.exists("File", CATALOGUE_FOLDER):
        create_new_folder("Item Catalogue Images", "Home")

    return CATALOGUE_FOLDER


@frappe.whitelist()
def get_catalogue_folder():
    return ensure_catalogue_folder()


@frappe.whitelist()
def list_catalogue_images():

    folder = ensure_catalogue_folder()

    files = frappe.get_all(
        "File",
        filters={
            "folder": folder,
            "is_folder": 0
        },
        fields=["name", "file_url", "file_name", "creation"],
        order_by="creation desc"
    )

    # The same physical image can currently exist as multiple File
    # rows (one per item it's attached to) - collapse those down to
    # one gallery card per unique file.
    seen = set()
    result = []

    for f in files:

        if f.file_url in seen:
            continue

        seen.add(f.file_url)
        result.append(f)

    return result


@frappe.whitelist()
def get_variants_for_tag(item_code, colour, colour_code):

    if not (item_code and colour and colour_code):
        return []

    variants = frappe.get_all(
        "Item",
        filters={
            "variant_of": item_code,
            "has_variants": 0
        },
        pluck="name"
    )

    matched = []

    for variant in variants:

        attributes = {
            d.attribute: d.attribute_value
            for d in frappe.get_all(
                "Item Variant Attribute",
                filters={"parent": variant},
                fields=["attribute", "attribute_value"]
            )
        }

        if (
            attributes.get("Colour") == colour
            and attributes.get("Colour Code") == colour_code
        ):
            matched.append({
                "item_code": variant,
                "size": attributes.get("Size")
            })

    matched.sort(key=lambda d: d["size"] or "")

    return matched


@frappe.whitelist()
def get_linked_items(file_url):

    if not file_url:
        return []

    linked = {}

    for item in frappe.get_all(
        "Item",
        filters={"image": file_url},
        fields=["name"]
    ):
        linked[item.name] = "Primary"

    for f in frappe.get_all(
        "File",
        filters={
            "file_url": file_url,
            "attached_to_doctype": "Item"
        },
        fields=["attached_to_name"]
    ):
        linked.setdefault(f.attached_to_name, "Attachment")

    return [
        {"name": name, "role": role}
        for name, role in sorted(linked.items())
    ]


@frappe.whitelist()
def assign_catalogue_images(
    secondary_file_urls,
    item_codes,
    mode="retain",
    primary_file_url=None
):

    if isinstance(secondary_file_urls, str):
        secondary_file_urls = frappe.parse_json(secondary_file_urls)

    if isinstance(item_codes, str):
        item_codes = frappe.parse_json(item_codes)

    secondary_file_urls = [u for u in (secondary_file_urls or []) if u]

    folder = ensure_catalogue_folder()

    updated = []
    skipped = []

    for item_code in item_codes:

        if not frappe.db.exists("Item", item_code):
            skipped.append(item_code)
            continue

        if mode == "override":

            # Only clear the cover photo if we're actually about to
            # replace it - "keep existing primary" means leave it be.
            if primary_file_url:
                frappe.db.set_value("Item", item_code, "image", None)

            # Remove every existing *image* attachment on this item,
            # regardless of which folder it was filed under - a photo
            # attached straight from the Item form (folder "Home/
            # Attachments") still counts as an "existing image" from
            # the user's point of view. Non-image attachments (a spec
            # sheet PDF, say) are left alone.
            existing = frappe.get_all(
                "File",
                filters={
                    "attached_to_doctype": "Item",
                    "attached_to_name": item_code
                },
                fields=["name", "file_url"]
            )

            for f in existing:

                ext = (f.file_url or "").rsplit(".", 1)[-1].lower()

                if ext in IMAGE_EXTENSIONS:
                    frappe.delete_doc(
                        "File",
                        f.name,
                        ignore_permissions=True
                    )

        current_image = frappe.db.get_value("Item", item_code, "image")

        item_secondary_urls = list(secondary_file_urls)

        if primary_file_url:

            if (
                mode == "retain"
                and current_image
                and current_image != primary_file_url
                and current_image not in item_secondary_urls
            ):
                # Retain: don't lose the item's current cover photo
                # just because a new one was picked - keep it around
                # as an attachment instead of discarding it.
                item_secondary_urls.append(current_image)

            # Whichever image was explicitly marked Primary always
            # becomes the cover photo - no new File row, just point
            # the Item's own image field at the already-uploaded file.
            frappe.db.set_value(
                "Item",
                item_code,
                "image",
                primary_file_url
            )

        # else: "keep existing primary" was chosen - Item.image is
        # left untouched, every selected file just gets attached below.

        for file_url in item_secondary_urls:

            if frappe.db.exists(
                "File",
                {
                    "file_url": file_url,
                    "attached_to_doctype": "Item",
                    "attached_to_name": item_code
                }
            ):
                continue

            frappe.get_doc({
                "doctype": "File",
                "file_url": file_url,
                "attached_to_doctype": "Item",
                "attached_to_name": item_code,
                "folder": folder,
                "is_private": 0
            }).insert(ignore_permissions=True)

        updated.append(item_code)

    return {
        "updated": updated,
        "skipped": skipped
    }
