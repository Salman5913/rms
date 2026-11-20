import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm, STATUS_FILTER } from "../Crud";
import { StatusText } from "../ui";

const columns = [
    { key: "name", label: "Category Name" },
    { key: "slug", label: "Slug" },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];
const fields = [
    { name: "name", label: "Category Name", required: true },
    { name: "image", label: "Category Image", type: "image" },
    { name: "status", label: "Available", type: "checkbox", default: true },
];

export default function Categories() {
    return (
        <Routes>
            <Route index element={<CrudPage title="Categories" endpoint="admin/categories" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Category" endpoint="admin/categories" fields={fields} backTo="/categories" />} />
            <Route path=":id" element={<CrudForm title="Category" endpoint="admin/categories" fields={fields} backTo="/categories" />} />
            <Route path=":id/edit" element={<CrudForm title="Category" endpoint="admin/categories" fields={fields} backTo="/categories" />} />
        </Routes>
    );
}
