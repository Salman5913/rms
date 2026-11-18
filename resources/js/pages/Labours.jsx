import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm } from "../Crud";
import { Select } from "../ui";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const USER_TYPES = ["rider", "cook", "waiter", "cleaner", "manager", "other"].map((v) => ({ value: v, label: cap(v) }));
const PAY_TYPES = ["monthly", "weekly", "daily"].map((v) => ({ value: v, label: cap(v) }));

const columns = [
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "cnic", label: "CNIC" },
    { key: "user_type", label: "Type", render: (r) => cap(r.user_type ?? "") || "—" },
    { key: "pay", label: "Pay", render: (r) => `Rs. ${Number(r.pay_rate).toLocaleString()} / ${r.pay_type}` },
    { key: "status", label: "Status", render: (r) => (r.status ? "✅ Active" : "⛔ Disabled") },
];
const fields = [
    { name: "name", label: "Name", required: true },
    { name: "phone", label: "Phone" },
    { name: "cnic", label: "CNIC" },
    { name: "user_type", label: "Type", type: "select", options: USER_TYPES, required: true },
    { name: "pay_type", label: "Pay Type", type: "select", options: PAY_TYPES, required: true, default: "monthly" },
    { name: "pay_rate", label: "Pay Rate", type: "number", default: 0 },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

function LabourList() {
    const [userType, setUserType] = useState("");
    return (
        <CrudPage title="Labour" endpoint="admin/labours" columns={columns}
            searchPlaceholder="Search name / phone / CNIC…"
            params={userType ? { user_type: userType } : {}}
            filters={<Select value={userType} onChange={(v) => setUserType(v ?? "")} options={USER_TYPES}
                placeholder="All types" searchable={false} className="w-44" />} />
    );
}

export default function Labours() {
    const form = <CrudForm title="Labour" endpoint="admin/labours" fields={fields} backTo="/labours" />;
    return (
        <Routes>
            <Route index element={<LabourList />} />
            <Route path="create" element={form} />
            <Route path=":id" element={form} />
            <Route path=":id/edit" element={form} />
        </Routes>
    );
}
