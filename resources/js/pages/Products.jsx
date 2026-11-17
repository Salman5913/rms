import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm } from "../Crud";

const availabilityOptions = [
    { value: "website", label: "For Website" },
    { value: "pickup", label: "For Pickup" },
    { value: "both", label: "For Both" },
    { value: "unavailable", label: "Unavailable" },
];

const columns = [
    { key: "name", label: "Product Name" },
    { key: "price", label: "Price", render: (r) => `Rs. ${Number(r.price).toLocaleString()}` },
    { key: "categories", label: "Categories", render: (r) => r.categories?.map((c) => c.name).join(", ") || "—" },
    { key: "availability", label: "Availability", render: (r) => availabilityOptions.find((o) => o.value === r.availability)?.label },
    { key: "is_popular", label: "Popular", render: (r) => (r.is_popular ? "🔥" : "—") },
    { key: "status", label: "Status", render: (r) => (r.status ? "✅" : "⛔") },
];

const fields = [
    { name: "name", label: "Product Name", required: true },
    { name: "description", label: "Product Description", type: "textarea", required: true },
    { name: "price", label: "Product Price", type: "number", required: true },
    { name: "image", label: "Product Image", type: "image" },
    { name: "badge", label: "Product Badge (e.g. Bestseller)" },
    { name: "is_popular", label: "Show in Popular Items", type: "checkbox" },
    { name: "categories", label: "Categories", type: "multiselect", endpoint: "admin/categories/all", required: true, many: true },
    { name: "availability", label: "Availability", type: "select", options: availabilityOptions, required: true, default: "both" },
    { name: "options_title", label: "Options Section Title (required if Options selected)" },
    { name: "options", label: "Options (single-choice: drinks, sizes…)", type: "multiselect", endpoint: "admin/options/all", many: true },
    { name: "extras_title", label: "Extras Section Title (required if Extras selected)" },
    { name: "extras", label: "Extras (multi-choice add-ons)", type: "multiselect", endpoint: "admin/extras/all", many: true },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

export default function Products() {
    return (
        <Routes>
            <Route index element={<CrudPage title="Products" endpoint="admin/products" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Product" endpoint="admin/products" fields={fields} backTo="/products" />} />
            <Route path=":id" element={<CrudForm title="Product" endpoint="admin/products" fields={fields} backTo="/products" />} />
            <Route path=":id/edit" element={<CrudForm title="Product" endpoint="admin/products" fields={fields} backTo="/products" />} />
        </Routes>
    );
}
