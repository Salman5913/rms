import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm, STATUS_FILTER } from "../Crud";
import { StatusText } from "../ui";

const columns = [
    { key: "name", label: "Extra Item Name" },
    { key: "price", label: "Price", render: (r) => `Rs. ${Number(r.price).toLocaleString()}` },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];
const fields = [
    { name: "name", label: "Extra Item Name", required: true },
    { name: "price", label: "Extra Item Price", type: "number", required: true },
    { name: "status", label: "Available", type: "checkbox", default: true },
];

export default function Extras() {
    return (
        <Routes>
            <Route index element={<CrudPage title="Extras" endpoint="admin/extras" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Extra" endpoint="admin/extras" fields={fields} backTo="/extras" />} />
            <Route path=":id" element={<CrudForm title="Extra" endpoint="admin/extras" fields={fields} backTo="/extras" />} />
            <Route path=":id/edit" element={<CrudForm title="Extra" endpoint="admin/extras" fields={fields} backTo="/extras" />} />
        </Routes>
    );
}
