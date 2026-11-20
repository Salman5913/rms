import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm, STATUS_FILTER } from "../Crud";
import { StatusText } from "../ui";

const columns = [
    { key: "name", label: "Area Name" },
    { key: "delivery_charges", label: "Delivery Charges", render: (r) => `Rs. ${Number(r.delivery_charges).toLocaleString()}` },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];
const fields = [
    { name: "name", label: "Area Name", required: true },
    { name: "delivery_charges", label: "Delivery Charges", type: "number", required: true },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

export default function DeliveryAreas() {
    const form = <CrudForm title="Delivery Area" endpoint="admin/delivery-areas" fields={fields} backTo="/delivery-areas" />;
    return (
        <Routes>
            <Route index element={<CrudPage title="Delivery Areas" endpoint="admin/delivery-areas" columns={columns} />} />
            <Route path="create" element={form} />
            <Route path=":id" element={form} />
            <Route path=":id/edit" element={form} />
        </Routes>
    );
}
