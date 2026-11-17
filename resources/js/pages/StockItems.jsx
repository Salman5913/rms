import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm } from "../Crud";

const units = ["kg", "number", "dozen", "packs", "mann"].map((u) => ({ value: u, label: u }));
const columns = [
    { key: "name", label: "Item Name" },
    { key: "unit", label: "Unit" },
    { key: "value", label: "Value" },
];
const fields = [
    { name: "name", label: "Item Name", required: true },
    { name: "unit", label: "Unit", type: "select", options: units, required: true },
    { name: "value", label: "Value", type: "number", required: true },
];

export default function StockItems() {
    return (
        <Routes>
            <Route index element={<CrudPage title="Stock Items" endpoint="admin/stock-items" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Stock Item" endpoint="admin/stock-items" fields={fields} backTo="/stock-items" />} />
            <Route path=":id" element={<CrudForm title="Stock Item" endpoint="admin/stock-items" fields={fields} backTo="/stock-items" />} />
            <Route path=":id/edit" element={<CrudForm title="Stock Item" endpoint="admin/stock-items" fields={fields} backTo="/stock-items" />} />
        </Routes>
    );
}
