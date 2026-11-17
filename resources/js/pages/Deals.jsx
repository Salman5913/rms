import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm } from "../Crud";

const columns = [
    { key: "name", label: "Deal Name" },
    { key: "price", label: "Price", render: (r) => `Rs. ${Number(r.price).toLocaleString()}` },
    { key: "badge", label: "Badge" },
    { key: "products", label: "Products", render: (r) => r.products?.map((p) => p.name).join(", ") || "—" },
    { key: "status", label: "Status", render: (r) => (r.status ? "✅" : "⛔") },
];

const fields = [
    { name: "name", label: "Deal Name", required: true },
    { name: "description", label: "Deal Description", type: "textarea", required: true },
    { name: "price", label: "Deal Price", type: "number", required: true },
    { name: "image", label: "Deal Image", type: "image" },
    { name: "badge", label: "Deal Badge (e.g. Save 25%)" },
    { name: "products", label: "Products in Deal", type: "multiselect", endpoint: "admin/products/all", required: true, many: true },
    { name: "options_title", label: "Options Section Title (required if Options selected)" },
    { name: "options", label: "Options", type: "multiselect", endpoint: "admin/options/all", many: true },
    { name: "extras_title", label: "Extras Section Title (required if Extras selected)" },
    { name: "extras", label: "Extras", type: "multiselect", endpoint: "admin/extras/all", many: true },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

export default function Deals() {
    return (
        <Routes>
            <Route index element={<CrudPage title="Deals" endpoint="admin/deals" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Deal" endpoint="admin/deals" fields={fields} backTo="/deals" />} />
            <Route path=":id" element={<CrudForm title="Deal" endpoint="admin/deals" fields={fields} backTo="/deals" />} />
            <Route path=":id/edit" element={<CrudForm title="Deal" endpoint="admin/deals" fields={fields} backTo="/deals" />} />
        </Routes>
    );
}
