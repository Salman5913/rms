import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api";
import { Btn, Ico, Pagination, Select, Spinner, inputCls } from "../ui";
import { formatDateTime } from "../utils";
import ExportModal from "../ExportModal";
import { useAuth, useRedirectBack } from "../auth";
import { MODULES, orderModule } from "../modules";

const STATUSES = ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
const STATUS_LABEL = { RECEIVED: "Received", PREPARING: "Preparing", READY: "Ready", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered" };

export function StatusSelect({ order, onChanged }) {
    const [status, setStatus] = useState(order.status);
    const canEdit = useAuth().can(orderModule(order.type), "edit");
    return (
        <Select size="sm" searchable={false} clearable={false} value={status} disabled={!canEdit}
            onChange={async (v) => {
                if (!v || v === status) return;
                setStatus(v);
                await api.post(`/admin/orders/${order.id}/status`, { status: v });
                onChanged?.();
            }}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            className="w-40" />
    );
}

export default function WebsiteOrders() {
    const [data, setData] = useState(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [exportOpen, setExportOpen] = useState(false);
    const nav = useNavigate();   // ← move here
    const allowEdit = useAuth().can("website-orders", "edit");

    const load = (p = page, s = search) =>
        api.get("/admin/orders", { params: { type: "website", search: s, page: p } }).then((r) => {
            if (r.data.data.length === 0 && p > 1) return load(p - 1, s);
            setData(r.data); setPage(r.data.current_page);
        });
    // runs on mount and whenever the search changes; a new search starts from page 1
    useEffect(() => { const t = setTimeout(() => load(1, search), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line

    if (!data) return <Spinner />;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-xl font-extrabold text-slate-800">Website Orders</h2>
                <div className="flex gap-2">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # / customer…" className={inputCls + " !w-64"} />
                    <Btn
                        onClick={() => setExportOpen(true)}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                        <Ico n="download" /> Export
                    </Btn>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 font-semibold">Order #</th>
                            <th className="p-3 font-semibold">Items</th>
                            <th className="p-3 font-semibold">Customer</th>
                            <th className="p-3 font-semibold">Phone</th>
                            <th className="p-3 font-semibold">Items</th>
                            <th className="p-3 font-semibold">Total</th>
                            <th className="p-3 font-semibold">Status</th>
                            <th className="p-3 font-semibold">Order Date</th>
                            <th className="p-3 w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.data.map((o) => (
                            <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)}
                                className={"border-b last:border-0 cursor-pointer " + (!o.is_viewed ? "bg-yellow-50 hover:bg-yellow-100" : "hover:bg-slate-50")}>
                                <td className="p-3 font-semibold">{o.order_number}{!o.is_viewed && <span className="ml-2 text-[10px] bg-yellow-400 text-yellow-900 font-bold px-1.5 py-0.5 rounded-full">NEW</span>}</td>
                                <td className="p-3 font-semibold">{o.items?.map((i) => `${i.name} (${i.qty})`)?.join(' , ')}</td>
                                <td className="p-3">{o.customer_name}</td>
                                <td className="p-3">{o.customer_phone}</td>
                                <td className="p-3">{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                                <td className="p-3 font-bold">Rs. {Number(o.total).toLocaleString()}</td>
                                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                    <StatusSelect order={o} onChanged={() => load()} />
                                </td>
                                <td className="p-3 text-slate-400 text-xs">{formatDateTime(o.created_at)}</td>
                                <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1.5">
                                        <Link to={`/orders/${o.id}`} title="View" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="eye" /></Link>
                                        {allowEdit && (o.status === "RECEIVED"
                                            ? <Link to={`/orders/${o.id}/edit`} title="Edit" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="edit" /></Link>
                                            : <span title="Only Received orders can be edited" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 opacity-40 cursor-not-allowed flex items-center justify-center"><Ico n="edit" /></span>)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.data.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-300">No orders yet</td></tr>}
                    </tbody>
                </table>
            </div>
            <Pagination data={data} onPage={(p) => load(p)} />
            {exportOpen && <ExportModal title="Website Orders" name="Website-Orders" url="/api/admin/orders?type=website&export=csv" onClose={() => setExportOpen(false)} />}
        </div>
    );
}

export function WebsiteOrderView() {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const nav = useNavigate();
    const { can } = useAuth();
    const redirectBack = useRedirectBack();
    // the order's type decides which Sales sub-module guards this page
    const allowed = order && can(orderModule(order.type), "view");

    useEffect(() => {
        api.get(`/admin/orders/${id}`).then((r) => {
            setOrder(r.data);
            if (!can(orderModule(r.data.type), "view")) return redirectBack();
            if (!r.data.is_viewed) api.post(`/admin/orders/${id}/viewed`);
        });
    }, [id]); // eslint-disable-line

    if (!allowed) return <Spinner />;

    return (
        <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-extrabold text-slate-800">Order {order.order_number}</h2>
                <div className="flex items-center gap-2">
                    <StatusSelect order={order} onChanged={() => api.get(`/admin/orders/${id}`).then((r) => setOrder(r.data))} />
                    <Btn onClick={() => nav(MODULES.find((m) => m.key === orderModule(order.type))?.path ?? "/orders/website")} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">← Back</Btn>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <p><span className="text-slate-400">Customer:</span> <b>{order.customer_name}</b></p>
                    <p><span className="text-slate-400">Phone:</span> <b>{order.customer_phone}</b></p>
                    <p className="col-span-2"><span className="text-slate-400">Address:</span> {order.address}</p>
                    {order.notes && <p className="col-span-2"><span className="text-slate-400">Notes:</span> {order.notes}</p>}
                    {order.delivery_area && <p className="col-span-2"><span className="text-slate-400">Delivery Area:</span> <b>{order.delivery_area}</b></p>}
                </div>
                <div className="border-t pt-3 space-y-2">
                    {order.items.map((i) => (
                        <div key={i.id} className="flex justify-between text-sm">
                            <span>{i.name} × {i.qty}
                                {i.modifiers?.length > 0 && (
                                    <span className="block text-xs text-slate-400">{i.modifiers.map((m) => m.option?.name ?? m.name).join(", ")}</span>
                                )}
                            </span>
                            <span className="font-semibold">Rs. {(i.unit_price * i.qty).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                {Number(order.delivery_charges) > 0 && (
                    <div className="border-t pt-3 space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Order Amount</span><span>Rs. {(order.total - order.delivery_charges).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Delivery Charges</span><span>Rs. {Number(order.delivery_charges).toLocaleString()}</span></div>
                    </div>
                )}
                <div className="border-t pt-3 flex justify-between font-extrabold">
                    <span>Total</span><span className="text-brand-600">Rs. {Number(order.total).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}
