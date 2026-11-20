import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm, STATUS_FILTER } from "../Crud";
import { StatusText } from "../ui";

/* a category with expenses can't be deleted (the API answers 422): deactivate it instead */
const columns = [
    { key: "name", label: "Category" },
    // all-time figures, calculated by the API
    { key: "entries", label: "Entries", render: (r) => Number(r.entries ?? 0).toLocaleString() },
    { key: "amount", label: "Amount", render: (r) => `Rs. ${Number(r.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
    { key: "percent", label: "%", render: (r) => `${Number(r.percent ?? 0)}%` },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];
const fields = [
    { name: "name", label: "Category", required: true },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

export default function ExpenseCategories() {
    const form = <CrudForm title="Expense Category" endpoint="admin/expense-categories" fields={fields} backTo="/expense-categories" />;
    return (
        <Routes>
            <Route index element={<CrudPage title="Expense Categories" endpoint="admin/expense-categories" columns={columns} canImport={false} />} />
            <Route path="create" element={form} />
            <Route path=":id" element={form} />
            <Route path=":id/edit" element={form} />
        </Routes>
    );
}
