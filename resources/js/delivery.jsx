/* Home delivery building blocks shared by the delivery list, create, edit and view pages. */
import { useEffect, useState } from "react";
import api from "./api";
import { Field, Select, inputCls } from "./ui";
import { useDialog } from "./Dialog";

export const DELIVERY_STATUSES = [
    { value: "RECEIVED", label: "Received" },
    { value: "OUT_FOR_DELIVERY", label: "Out for delivery" },
    { value: "DELIVERED", label: "Delivered" },
    { value: "CANCELLED", label: "Cancelled" },
];

export const emptyCustomer = { customer_name: "", customer_phone: "", address: "", rider_id: null };

/** the customer fields of a saved order, for the customer card */
export const customerOf = (order) => ({
    customer_name: order.customer_name ?? "",
    customer_phone: order.customer_phone ?? "",
    address: order.address ?? "",
    rider_id: order.rider_id ?? null,
});

/** [title, message] of the first required customer field that is still empty, or null */
export const missingCustomerField = (c) => {
    if (!c.customer_name.trim()) return ["Customer name required", "Enter the customer's name before placing the order."];
    if (!c.customer_phone.trim()) return ["Phone required", "Enter the customer's phone number before placing the order."];
    if (!c.address.trim()) return ["Address required", "Enter the delivery address before placing the order."];
    return null;
};

/** active riders for the rider dropdowns (the endpoint needs delivery access only, not the Labour module) */
export function useRiders() {
    const [riders, setRiders] = useState([]);
    useEffect(() => { api.get("/admin/riders").then((r) => setRiders(r.data)); }, []);
    return riders;
}

/** rider options; keeps the order's current rider listed even if they've since been disabled */
const riderOptions = (riders, order) => {
    const opts = riders.map((r) => ({ value: r.id, label: r.phone ? `${r.name} (${r.phone})` : r.name }));
    if (order?.rider_id && !riders.some((r) => r.id === order.rider_id)) {
        opts.push({ value: order.rider_id, label: order.rider_name ?? `Rider #${order.rider_id}` });
    }
    return opts;
};

/* ---------- "Customer details" card (create + edit sidebars) ---------- */
/* `areaSelect`: optional delivery area dropdown, shown above the address (create screen only) */
export function CustomerCard({ value, onChange, riders, order, areaSelect, areaRequired = true }) {
    const set = (k, v) => onChange({ ...value, [k]: v });
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">Customer details</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
                <Field label="Customer name" required>
                    <input value={value.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Phone" required>
                    <input type="tel" value={value.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} className={inputCls} />
                </Field>
                {areaSelect && <Field label="Delivery area" required={areaRequired}>{areaSelect}</Field>}
                <Field label="Address" required>
                    <textarea rows={2} value={value.address} onChange={(e) => set("address", e.target.value)} className={inputCls + " resize-y"} />
                </Field>
                <Field label="Rider">
                    <Select value={value.rider_id} onChange={(v) => set("rider_id", v === "" || v == null ? null : Number(v))}
                        options={riderOptions(riders, order)} placeholder="Assign later" />
                </Field>
            </div>
        </div>
    );
}

const errorMessage = (err, fallback) => err.response?.data?.message ?? fallback;

/* ---------- status dropdown: Received / Out for delivery / Delivered ---------- */
export function DeliveryStatusSelect({ order, onChanged, disabled }) {
    const [status, setStatus] = useState(order.status);
    const dialog = useDialog();
    useEffect(() => setStatus(order.status), [order.status]);

    // an order saved with an older status (e.g. Preparing) still shows it
    const options = DELIVERY_STATUSES.some((s) => s.value === status)
        ? DELIVERY_STATUSES
        : [...DELIVERY_STATUSES, { value: status, label: status }];

    return (
        <Select size="sm" searchable={false} clearable={false} value={status} disabled={disabled}
            onChange={async (v) => {
                if (!v || v === status) return;
                const prev = status;
                setStatus(v);
                try {
                    await api.post(`/admin/orders/${order.id}/status`, { status: v });
                    onChanged?.();
                } catch (err) {
                    setStatus(prev);
                    dialog.alert(errorMessage(err, "The status could not be changed. Try again."), { title: "Can't change status", variant: "warning" });
                }
            }}
            options={options} className="w-40" />
    );
}

/* ---------- rider dropdown in a list row ---------- */
export function RiderSelect({ order, riders, onChanged, disabled }) {
    const [riderId, setRiderId] = useState(order.rider_id ?? null);
    const dialog = useDialog();
    useEffect(() => setRiderId(order.rider_id ?? null), [order.rider_id]);

    return (
        <Select size="sm" value={riderId} disabled={disabled} placeholder="Assign later"
            onChange={async (v) => {
                const next = v === "" || v == null ? null : Number(v);
                if (next === riderId) return;
                const prev = riderId;
                setRiderId(next);
                try {
                    await api.post(`/admin/orders/${order.id}/rider`, { rider_id: next });
                    onChanged?.();
                } catch (err) {
                    setRiderId(prev);
                    dialog.alert(errorMessage(err, "The rider could not be changed. Try again."), { title: "Can't change rider", variant: "warning" });
                }
            }}
            options={riderOptions(riders, order)} className="w-44" />
    );
}
