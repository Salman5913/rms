import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import api from "../api";
import { CrudPage, CrudForm } from "../Crud";
import { Select } from "../ui";
import { formatDateTime } from "../utils";

/* Customers are also saved automatically by the first home delivery / website order of a new phone number.
   The phone is the customer's key: the order create page fills in their details from it. */

/** delivery area dropdown for the customer form (all areas, so an old customer keeps a disabled area) */
function AreaSelect({ value, onChange, disabled }) {
    const [areas, setAreas] = useState([]);
    useEffect(() => { api.get("/admin/delivery-areas/all").then((r) => setAreas(r.data)); }, []);
    return (
        <Select value={value || null} disabled={disabled} placeholder="Select delivery area"
            onChange={(v) => onChange(v === "" || v == null ? null : Number(v))}
            options={areas.map((a) => ({ value: a.id, label: a.name }))} />
    );
}

const columns = [
    // name and phone stacked in one column (same style as the Customer column on Home Delivery)
    {
        key: "name", label: "Customer",
        render: (r) => (
            <div className="min-w-[160px] max-w-[240px]">
                <span className="block font-semibold text-slate-700 truncate" title={r.name}>{r.name}</span>
                <span className="block text-xs text-slate-500 whitespace-nowrap">{r.phone}</span>
            </div>
        ),
    },
    { key: "address", label: "Address", render: (r) => <span className="block max-w-[320px] truncate" title={r.address ?? ""}>{r.address || "—"}</span> },
    { key: "delivery_area", label: "Delivery Area", render: (r) => r.delivery_area?.name ?? "—" },
    { key: "created_at", label: "Customer Since", render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
];
const fields = [
    { name: "phone", label: "Phone", required: true },
    { name: "name", label: "Name", required: true },
    { name: "address", label: "Address", type: "textarea" },
    { name: "delivery_area_id", label: "Delivery Area", render: (p) => <AreaSelect {...p} /> },
];

export default function Customers() {
    const form = <CrudForm title="Customer" endpoint="admin/customers" fields={fields} backTo="/customers" />;
    return (
        <Routes>
            <Route index element={<CrudPage title="Customers" endpoint="admin/customers" columns={columns}
                searchPlaceholder="Search name / phone / address…" canImport={false} />} />
            <Route path="create" element={form} />
            <Route path=":id" element={form} />
            <Route path=":id/edit" element={form} />
        </Routes>
    );
}
