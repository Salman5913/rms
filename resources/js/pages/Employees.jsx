import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "../auth";
import { CrudPage, CrudForm, STATUS_FILTER } from "../Crud";
import { fmtDate } from "../DateRangeFilter";
import { ActionMenu, Select, StatusText } from "../ui";
import { PAYMENTS_MODULE, PaymentModal, employeeType, rs } from "./EmployeePayments";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const USER_TYPES = ["rider", "cook", "waiter", "cleaner", "manager", "other"].map((v) => ({ value: v, label: cap(v) }));
const PAY_TYPES = ["monthly", "weekly", "daily"].map((v) => ({ value: v, label: cap(v) }));

const columns = [
    // name, phone and CNIC stacked in one column (same style as the Customer column on Home Delivery)
    {
        key: "name", label: "Employee",
        render: (r) => (
            <div className="min-w-[160px] max-w-[240px]">
                <span className="block font-semibold text-slate-700 truncate" title={r.name}>{r.name}</span>
                {r.phone && <span className="block text-xs text-slate-500 whitespace-nowrap">{r.phone}</span>}
                {r.cnic && <span className="block text-xs text-slate-400 whitespace-nowrap">{r.cnic}</span>}
            </div>
        ),
    },
    { key: "user_type", label: "Type", render: (r) => employeeType(r) || "—" },
    { key: "pay", label: "Pay", render: (r) => `Rs. ${Number(r.pay_rate).toLocaleString()} / ${r.pay_type}` },
    {
        key: "outstanding_advance", label: "Outstanding Advance",
        render: (r) => <span className={"whitespace-nowrap " + (r.outstanding_advance > 0 ? "font-semibold text-amber-600" : "text-slate-400")}>{rs(r.outstanding_advance)}</span>,
    },
    { key: "last_salary_date", label: "Last Salary Paid", render: (r) => <span className="whitespace-nowrap">{fmtDate(r.last_salary_date) || "—"}</span> },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];
const fields = [
    { name: "name", label: "Name", required: true },
    { name: "phone", label: "Phone" },
    { name: "cnic", label: "CNIC" },
    { name: "user_type", label: "Type", type: "select", options: USER_TYPES, required: true },
    // only for Type = Other; the server clears it for every other type
    { name: "user_type_other", label: "Other type (e.g. Helper, Guard)", required: true, show: (v) => v.user_type === "other" },
    { name: "pay_type", label: "Pay Type", type: "select", options: PAY_TYPES, required: true, default: "monthly" },
    { name: "pay_rate", label: "Pay Rate", type: "number", default: 0 },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

function EmployeeList() {
    const { can } = useAuth();
    const [userType, setUserType] = useState("");
    const [modal, setModal] = useState(null); // { employee, type, reload }

    // ledger / pay salary / give advance share one "⋯" menu so the actions column stays narrow
    const extraActions = (row, reload) => {
        const canPay = can(PAYMENTS_MODULE, "create") && row.status;
        return (
            <ActionMenu items={[
                can(PAYMENTS_MODULE, "view") && { label: "Ledger", icon: "book", to: `${row.id}/ledger` },
                canPay && { label: "Pay salary", icon: "cash", className: "text-emerald-700",
                    onClick: () => setModal({ employee: row, type: "salary", reload }) },
                canPay && { label: "Give advance", icon: "cash", className: "text-amber-700",
                    onClick: () => setModal({ employee: row, type: "advance", reload }) },
            ]} />
        );
    };

    return (
        <>
            <CrudPage title="Employees" endpoint="admin/employees" columns={columns}
                searchPlaceholder="Search name / phone / CNIC…"
                params={userType ? { user_type: userType } : {}}
                extraActions={extraActions}
                filters={<Select value={userType} onChange={(v) => setUserType(v ?? "")} options={USER_TYPES}
                    placeholder="All types" searchable={false} className="w-44" />} />
            {modal && <PaymentModal type={modal.type} employee={modal.employee} onClose={() => setModal(null)}
                onSaved={() => { modal.reload(); setModal(null); }} />}
        </>
    );
}

export default function Employees() {
    const form = <CrudForm title="Employee" endpoint="admin/employees" fields={fields} backTo="/employees" />;
    return (
        <Routes>
            <Route index element={<EmployeeList />} />
            <Route path="create" element={form} />
            <Route path=":id" element={form} />
            <Route path=":id/edit" element={form} />
        </Routes>
    );
}
