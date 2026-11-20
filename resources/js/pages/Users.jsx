import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm, STATUS_FILTER } from "../Crud";
import api from "../api";
import { Select, StatusText } from "../ui";

function RolesSelect({ value, onChange, disabled }) {
    const [roles, setRoles] = useState([]);
    useEffect(() => {
        api.get("/admin/roles", { params: { all: 1 } }).then((r) => setRoles(r.data.filter((x) => x.status)));
    }, []);
    return (
        <Select value={value} disabled={disabled} onChange={(v) => onChange(v === "" ? "" : Number(v))}
            placeholder="Select role" options={roles.map((r) => ({ value: r.id, label: r.name }))} />
    );
}

const columns = [
    { key: "name", label: "User Name" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role", render: (r) => r.role?.name ?? "—" },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];

export default function Users() {
    const fields = [
        { name: "name", label: "User Name", required: true },
        { name: "email", label: "User Email", type: "email", required: true },
        { name: "password", label: "Password (leave blank to keep current)", type: "password" },
        { name: "role_id", label: "Role", required: true, render: (p) => <RolesSelect {...p} /> },
        { name: "status", label: "Active", type: "checkbox", default: true },
    ];
    return (
        <Routes>
            <Route index element={<CrudPage title="Users" endpoint="admin/users" columns={columns} />} />
            <Route path="create" element={<CrudForm title="User" endpoint="admin/users" fields={fields} backTo="/users" />} />
            <Route path=":id" element={<CrudForm title="User" endpoint="admin/users" fields={fields} backTo="/users" />} />
            <Route path=":id/edit" element={<CrudForm title="User" endpoint="admin/users" fields={fields} backTo="/users" />} />
        </Routes>
    );
}
