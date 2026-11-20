import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api";
import { Btn, ColumnFilter, DatePicker, Ico, Pagination, Select, Spinner, TableBody, inputCls, useLoading } from "../ui";
import { formatDateTime } from "../utils";
import ExportModal from "../ExportModal";
import { useAuth, useRedirectBack } from "../auth";
import { MODULES, orderModule } from "../modules";
import { DeliveryStatusSelect, RiderSelect, riderFilterOptions, useRiders } from "../delivery";
import { useDialog } from "../Dialog";

const rs = (v) => `Rs. ${Number(v).toLocaleString()}`;

const STATUSES = ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
const STATUS_LABEL = { RECEIVED: "Received", PREPARING: "Preparing", READY: "Ready", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled" };
/** only website orders (of the types using this dropdown) can be cancelled */
const statusesFor = (type) => (type === "website" ? [...STATUSES, "CANCELLED"] : STATUSES);

export function StatusSelect({ order, onChanged }) {
    const [status, setStatus] = useState(order.status);
    const canEdit = useAuth().can(orderModule(order.type), "edit");
    const dialog = useDialog();
    useEffect(() => setStatus(order.status), [order.status]);
    return (
        <Select size="sm" searchable={false} clearable={false} value={status} disabled={!canEdit}
            onChange={async (v) => {
                if (!v || v === status) return;
                const prev = status;
                setStatus(v);
                try {
                    await api.post(`/admin/orders/${order.id}/status`, { status: v });
                    onChanged?.();
                } catch (err) {
                    // e.g. "Out for delivery" on a website order with no rider yet
                    setStatus(prev);
                    dialog.alert(err.response?.data?.message ?? "The status could not be changed. Try again.", { title: "Can't change status", variant: "warning" });
                }
            }}
            options={statusesFor(order.type).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            className="w-40" />
    );
}

export default function WebsiteOrders() {
    const [data, setData] = useState(null);
    const [loading, track] = useLoading();
    const [search, setSearch] = useState("");
    const [range, setRange] = useState({ from: "", to: "" }); // created-date filter, empty = all dates
    const [page, setPage] = useState(1);
    const [exportOpen, setExportOpen] = useState(false);
    const nav = useNavigate();   // ← move here
    const allowEdit = useAuth().can("website-orders", "edit");
    const riders = useRiders();
    const allRiders = useRiders(true);
    // column filters (?status= / ?rider_id=), "" = all
    const [statusFilter, setStatusFilter] = useState("");
    const [riderFilter, setRiderFilter] = useState("");
    const filterParams = { status: statusFilter || undefined, rider_id: riderFilter || undefined };

    // `quiet` reloads (after a rider / status change in a row) keep the rows on screen instead of showing the loader
    const load = (p = page, s = search, quiet = false) => {
        const request = api.get("/admin/orders", { params: { type: "website", search: s, page: p, from: range.from || undefined, to: range.to || undefined, ...filterParams } }).then((r) => {
            if (r.data.data.length === 0 && p > 1) return load(p - 1, s, quiet);
            setData(r.data); setPage(r.data.current_page);
        });
        return quiet ? request : track(request);
    };
    // runs on mount and whenever the search, date range or a column filter changes; a new filter starts from page 1
    useEffect(() => { const t = setTimeout(() => load(1, search), 300); return () => clearTimeout(t); }, [search, range, statusFilter, riderFilter]); // eslint-disable-line

    if (!data) return <Spinner />;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-xl font-extrabold text-slate-800">Website Orders</h2>
                <div className="flex flex-wrap justify-end gap-2">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # / customer…" className={inputCls + " !w-64"} />
                    <DatePicker range clearable value={range} onChange={setRange} placeholder="All dates" className="w-64" />
                    <Btn
                        onClick={() => setExportOpen(true)}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                        <Ico n="download" /> Export
                    </Btn>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 font-semibold whitespace-nowrap">Order #</th>
                            <th className="p-3 font-semibold">Customer</th>
                            <th className="p-3 font-semibold">Items</th>
                            <th className="p-3 font-semibold whitespace-nowrap">Delivery Area</th>
                            <th className="p-3 font-semibold">Total</th>
                            <th className="p-3 font-semibold whitespace-nowrap">Delivery Charges</th>
                            <th className="p-3 font-semibold">
                                <ColumnFilter label="Rider" value={riderFilter} onChange={setRiderFilter} options={riderFilterOptions(allRiders)} searchable />
                            </th>
                            <th className="p-3 font-semibold">
                                <ColumnFilter label="Status" value={statusFilter} onChange={setStatusFilter}
                                    options={statusesFor("website").map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
                            </th>
                            <th className="p-3 font-semibold whitespace-nowrap">Order Date</th>
                            {/* pinned so the action buttons stay visible when the table scrolls sideways */}
                            <th className="p-3 text-center sticky right-0 bg-slate-50 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">Actions</th>
                        </tr>
                    </thead>
                    <TableBody loading={loading} cols={10}>
                        {data.data.map((o) => {
                            const rowBg = !o.is_viewed ? "bg-yellow-50 group-hover:bg-yellow-100" : "bg-white group-hover:bg-slate-50";
                            return (
                            <tr key={o.id} onClick={() => nav(`/orders/${o.id}`)}
                                className={"group border-b border-slate-100 last:border-0 cursor-pointer " + rowBg}>
                                <td className="p-3 font-semibold whitespace-nowrap">
                                    {o.order_number}
                                    {!o.is_viewed && <span className="ml-2 text-[10px] bg-yellow-400 text-yellow-900 font-bold px-1.5 py-0.5 rounded-full">NEW</span>}
                                </td>
                                {/* name, phone and address stacked in one column */}
                                <td className="p-3 min-w-[180px] max-w-[240px]">
                                    <span className="block font-semibold text-slate-700 truncate" title={o.customer_name ?? ""}>{o.customer_name ?? "—"}</span>
                                    {o.customer_phone && <span className="block text-xs text-slate-500 whitespace-nowrap">{o.customer_phone}</span>}
                                    {o.address && <span className="block text-xs text-slate-400 truncate" title={o.address}>{o.address}</span>}
                                </td>
                                <td className="p-3 min-w-[200px] max-w-[280px] text-slate-700">{o.items?.map((i) => `${i.name} (${i.qty})`)?.join(", ")}</td>
                                <td className="p-3 min-w-[120px]">{o.delivery_area ?? "—"}</td>
                                <td className="p-3 whitespace-nowrap font-bold text-slate-800">{rs(o.total)}</td>
                                <td className="p-3 whitespace-nowrap">{rs(o.delivery_charges ?? 0)}</td>
                                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                    <RiderSelect order={o} riders={riders} disabled={!allowEdit} onChanged={() => load(page, search, true)} />
                                </td>
                                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                    <StatusSelect order={o} onChanged={() => load(page, search, true)} />
                                </td>
                                <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{formatDateTime(o.created_at)}</td>
                                <td className={"p-3 text-center sticky right-0 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] " + rowBg} onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-center gap-1.5">
                                        <Link to={`/orders/${o.id}`} title="View" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="eye" /></Link>
                                        {allowEdit && (o.status === "RECEIVED"
                                            ? <Link to={`/orders/${o.id}/edit`} title="Edit" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="edit" /></Link>
                                            : <span title="Only Received orders can be edited" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 opacity-40 cursor-not-allowed flex items-center justify-center"><Ico n="edit" /></span>)}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                        {data.data.length === 0 && <tr><td colSpan={10}className="p-10 text-center text-slate-300">No orders yet</td></tr>}
                    </TableBody>
                </table>
            </div>
            <Pagination data={data} onPage={(p) => load(p)} />
            {exportOpen && <ExportModal title="Website Orders" name="Website-Orders" url={`/api/admin/orders?${new URLSearchParams({ type: "website", export: "csv", ...(statusFilter ? { status: statusFilter } : {}), ...(riderFilter ? { rider_id: riderFilter } : {}) })}`} onClose={() => setExportOpen(false)} />}
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
                    {order.type === "delivery"
                        ? <DeliveryStatusSelect order={order} disabled={!can("delivery-orders", "edit")} onChanged={() => api.get(`/admin/orders/${id}`).then((r) => setOrder(r.data))} />
                        : <StatusSelect order={order} onChanged={() => api.get(`/admin/orders/${id}`).then((r) => setOrder(r.data))} />}
                    <Btn onClick={() => nav(MODULES.find((m) => m.key === orderModule(order.type))?.path ?? "/orders/website")} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">Back</Btn>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <p><span className="text-slate-400">Customer:</span> <b>{order.customer_name}</b></p>
                    <p><span className="text-slate-400">Phone:</span> <b>{order.customer_phone}</b></p>
                    <p className="col-span-2"><span className="text-slate-400">Address:</span> {order.address}</p>
                    {order.notes && <p className="col-span-2"><span className="text-slate-400">Notes:</span> {order.notes}</p>}
                    {order.delivery_area && <p className="col-span-2"><span className="text-slate-400">Delivery Area:</span> <b>{order.delivery_area}</b></p>}
                    {["delivery", "website"].includes(order.type) && <p className="col-span-2"><span className="text-slate-400">Rider:</span> <b>{order.rider_name ?? "Not assigned yet"}</b></p>}
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
                <div className="border-t pt-3 flex justify-between font-extrabold">
                    <span>Total</span><span className="text-brand-600">Rs. {Number(order.total).toLocaleString()}</span>
                </div>
                {/* delivery charges are kept separate from the total */}
                {Number(order.delivery_charges) > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Delivery Charges</span><span>Rs. {Number(order.delivery_charges).toLocaleString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
