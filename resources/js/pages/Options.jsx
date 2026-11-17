import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm } from "../Crud";

const columns = [
    { key: "name", label: "Option Name" },
    { key: "price", label: "Price", render: (r) => `Rs. ${Number(r.price).toLocaleString()}` },
    { key: "status", label: "Status", render: (r) => (r.status ? "✅ Active" : "⛔ Disabled") },
];
const fields = [
    { name: "name", label: "Option Name", required: true },
    { name: "price", label: "Option Price", type: "number", required: true },
    { name: "status", label: "Available", type: "checkbox", default: true },
];

export default function Options() {
    return (
        <Routes>
            <Route index element={<CrudPage title="Options" endpoint="admin/options" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Option" endpoint="admin/options" fields={fields} backTo="/options" />} />
            <Route path=":id" element={<CrudForm title="Option" endpoint="admin/options" fields={fields} backTo="/options" />} />
            <Route path=":id/edit" element={<CrudForm title="Option" endpoint="admin/options" fields={fields} backTo="/options" />} />
        </Routes>
    );
}
