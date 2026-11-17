import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { Btn, Ico, Pagination, Select, Spinner, inputCls } from "../ui";
import { CategoryMenu, MiniModal, printInvoice } from "./PickupOrders";
import { formatDateTime } from "../utils";
import ExportModal from "../ExportModal";
import { useDialog } from "../Dialog";
import { useAuth } from "../auth";

const rs = (v) => `Rs. ${Number(v).toLocaleString()}`;

/* ---------------- home delivery orders listing ---------------- */
export default function HomeDeliveryOrders() {
    const { can } = useAuth();
    const allowCreate = can("delivery-orders", "create");
    const allowEdit = can("delivery-orders", "edit");
    const allowDelete = can("delivery-orders", "delete");
    const [data, setData] = useState(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const nav = useNavigate();
    const dialog = useDialog();
    const [selected, setSelected] = useState([]);
    const [exportOpen, setExportOpen] = useState(false);

    const toggleAll = (e) => setSelected(e.target.checked ? data.data.map((r) => r.id) : []);
    const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    const bulkDelete = async () => {
        if (!selected.length || !(await dialog.confirm(`Delete ${selected.length} record(s)? This can't be undone.`, { title: "Delete records", okText: "Delete" }))) return;
        await api.post(`/admin/orders-bulk-delete`, { ids: selected });
        setSelected([]); load();
    };

    const destroy = async (id) => {
        if (!(await dialog.confirm("This record will be permanently deleted. This can't be undone.", { title: "Delete this record?", okText: "Delete" }))) return;
        await api.delete(`/admin/orders/${id}`); load();
    };
    const rows = data?.data ?? [];
    const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

    const load = (p = page, s = search) =>
        api.get("/admin/orders", { params: { type: "delivery", search: s, page: p } }).then((r) => {
            // deleting the last row on the last page leaves it empty — step back one page
            if (r.data.data.length === 0 && p > 1) return load(p - 1, s);
            setData(r.data); setPage(r.data.current_page);
        });
    const goTo = (p) => { setSelected([]); load(p); };
    // runs on mount and whenever the search changes; a new search starts from page 1
    useEffect(() => { const t = setTimeout(() => load(1, search), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line
    if (!data) return <Spinner />;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-xl font-extrabold text-slate-800">Home Delivery Orders</h2>
                <div className="flex gap-2">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # / customer…" className={inputCls + " !w-64"} />
                    <Btn onClick={() => setExportOpen(true)} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Ico n="download" /> Export
                    </Btn>
                    {allowDelete && <Btn onClick={bulkDelete} disabled={!selected.length}
                        className="bg-red-50 text-red-600 border border-red-200 disabled:opacity-40"><Ico n="trash" /> Trash ({selected.length})</Btn>}
                    {allowCreate && <Btn onClick={() => nav("create")} className="bg-brand-600 text-white hover:bg-brand-700"><Ico n="plus" /> New Home Delivery Order</Btn>}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand-600" /></th>
                            <th className="p-3 font-semibold">Order #</th>
                            <th className="p-3 font-semibold">Items</th>
                            <th className="p-3 font-semibold">Delivery Area</th>
                            <th className="p-3 font-semibold">Order Amount</th>
                            <th className="p-3 font-semibold">Delivery Charges</th>
                            <th className="p-3 font-semibold">Total</th>
                            <th className="p-3 font-semibold">Order Date</th>
                            <th className="p-3 w-20 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.data.map((o) => (
                            <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                                <td className="p-3"><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} className="accent-brand-600" /></td>
                                <td className="p-3 font-semibold">{o.order_number}</td>
                                <td className="p-3 font-semibold">{o.items?.map((i) => `${i.name} (${i.qty})`)?.join(' , ')}</td>
                                <td className="p-3">{o.delivery_area ?? "—"}</td>
                                <td className="p-3">{rs(o.total - o.delivery_charges)}</td>
                                <td className="p-3">{rs(o.delivery_charges)}</td>
                                <td className="p-3 font-bold">{rs(o.total)}</td>
                                <td className="p-3 text-slate-400 text-xs">{formatDateTime(o.created_at)}</td>
                                <td className="p-3 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        <Link to={`/orders/${o.id}`} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="eye" /></Link>
                                        {allowEdit && <Link to={`/orders/${o.id}/edit`} title="Edit" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="edit" /></Link>}
                                        {allowDelete && <button onClick={() => destroy(o.id)} title="Delete" className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center"><Ico n="trash" /></button>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.data.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-slate-300">No home delivery orders yet</td></tr>}
                    </tbody>
                </table>
            </div>
            <Pagination data={data} onPage={goTo} />
            {exportOpen && <ExportModal title="Home Delivery Orders" name="Home-Delivery-Orders" url="/api/admin/orders?type=delivery&export=csv" onClose={() => setExportOpen(false)} />}
        </div>
    );
}

/* same option/extra groups the other create pages build */
const groupsFor = (x, prefix) => [
    ...(x.options?.length
        ? [{ id: -1, _key: `${prefix}${x.id}-opt`, name: x.options_title || "Options", type: "single", required: true, options: x.options }]
        : []),
    ...(x.extras?.length
        ? [{ id: -2, _key: `${prefix}${x.id}-ext`, name: x.extras_title || "Extras", type: "multiple", required: false, options: x.extras }]
        : []),
];

/* ---------------- home delivery order create (website-style menu) ---------------- */
export function HomeDeliveryCreate() {
    const [home, setHome] = useState(null);
    const [areas, setAreas] = useState([]);
    const [areaId, setAreaId] = useState(null);
    const [q, setQ] = useState("");
    const [cart, setCart] = useState([]);
    const [modal, setModal] = useState(null);
    const [placing, setPlacing] = useState(false);
    const nav = useNavigate();
    const dialog = useDialog();

    useEffect(() => {
        api.get("/home").then((r) => setHome(r.data));
        api.get("/admin/delivery-areas", { params: { all: 1 } }).then((r) => setAreas(r.data.filter((a) => a.status)));
    }, []);

    const items = useMemo(() => {
        if (!home) return [];
        const prods = home.categories.flatMap((c) =>
            c.products.map((p) => ({
                ...p, _kind: "product", _group: c.name, _key: `p${p.id}`,
                modifiers: groupsFor(p, "p"),
                _disabled: ["website", "unavailable"].includes(p.availability),
            }))
        );
        const deals = home.deals.map((d) => ({
            ...d, _kind: "deal", _group: "Deals", _key: `d${d.id}`,
            modifiers: groupsFor(d, "d"),
            _disabled: false,
        }));
        return [...deals, ...prods].filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
    }, [home, q]);

    if (!home) return <Spinner />;

    const upsert = (cart, line) => {
        const ex = cart.find((l) => l.key === line.key);
        return ex ? cart.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)) : [...cart, line];
    };

    const add = (item) => {
        if (item.modifiers.length) setModal(item);
        else setCart((c) => upsert(c, {
            key: item._key,
            name: item.name,
            product_id: item._kind === "product" ? item.id : null,
            deal_id: item._kind === "deal" ? item.id : null,
            unit_price: Math.trunc(Number(item.price)),
            qty: 1,
            modifiers: [],
        }));
    };

    const area = areas.find((a) => a.id === areaId);
    const charges = Number(area?.delivery_charges ?? 0);
    const subtotal = cart.reduce((s, l) => s + l.unit_price * (Number(l.qty) || 0), 0);
    const total = subtotal + charges;
    const canPlace = cart.length > 0 && !!area && !placing;

    const place = async (print = false) => {
        if (!cart.length) return dialog.alert("Add at least one item to the cart before placing the order.", { title: "Cart is empty", variant: "warning" });
        if (!area) return dialog.alert("Select a delivery area before placing the order.", { title: "Delivery area required", variant: "warning" });

        const cartSnapshot = cart.map((l) => ({ ...l }));
        setPlacing(true);
        try {
            const r = await api.post("/admin/orders", {
                type: "delivery",
                delivery_area_id: area.id,
                items: cart.map(({ key, ...l }) => l),
            });
            if (print) printInvoice(r.data, cartSnapshot);
            setCart([]);
            setQ("");
            setAreaId(null);
        } catch (err) {
            console.error(err);
            dialog.alert(err.response?.data?.message ?? "The order could not be placed. Try again.", { title: "Order failed", variant: "danger" });
        } finally {
            setPlacing(false);
        }
    };

    // ---------- quantity helpers ----------
    const updateQty = (key, rawValue) => {
        if (rawValue === "") {
            setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: "" } : x)));
            return;
        }
        const num = Math.max(0, parseInt(rawValue, 10) || 0);
        setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: num } : x)).filter((x) => x.qty > 0));
    };
    const onQtyBlur = (key, rawValue) => {
        const num = Math.max(0, parseInt(rawValue, 10) || 0);
        setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: num } : x)).filter((x) => x.qty > 0));
    };

    const itemCount = cart.reduce((s, l) => s + (Number(l.qty) || 0), 0);

    return (
        <div className="flex gap-6 items-start">
            {/* ---------- menu ---------- */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-800">New Home Delivery Order</h2>
                        <p className="text-sm text-slate-400">Tap a dish to add it to the order</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search menu…" className={inputCls + " !w-64"} />
                        <Select value={areaId} onChange={setAreaId} placeholder="Select delivery area"
                            options={areas.map((a) => ({ value: a.id, label: `${a.name} (${rs(a.delivery_charges)})` }))}
                            className="w-64" />
                        <Btn onClick={() => nav("/orders/delivery")} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
                            ← Back
                        </Btn>
                    </div>
                </div>

                <CategoryMenu items={items} onAdd={add} forceOpen={!!q} cart={cart} onQty={updateQty} onQtyBlur={onQtyBlur} />
            </div>

            {/* ---------- order summary sidebar ---------- */}
            <aside className="w-[360px] flex-none sticky top-24 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Order summary</h3>
                    <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2.5 py-1">
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-2 min-h-[120px]">
                    {cart.length === 0 && (
                        <div className="text-center text-slate-300 py-10">
                            <p className="text-3xl mb-2">🛒</p>
                            <p className="text-sm">Your order is empty</p>
                        </div>
                    )}

                    {cart.map((l) => (
                        <div key={l.key} className="py-3 border-b border-slate-100 last:border-0">
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-sm font-semibold text-slate-700">
                                    {l.name}
                                    {l.modifiers.length > 0 && (
                                        <span className="block text-xs font-normal text-slate-400">
                                            + {l.modifiers.map((m) => m.option.name).join(", ")}
                                        </span>
                                    )}
                                </span>
                                <b className="text-sm text-slate-800 whitespace-nowrap">
                                    {rs((Number(l.unit_price) || 0) * (Number(l.qty) || 0))}
                                </b>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <button onClick={() => updateQty(l.key, Math.max(0, (Number(l.qty) || 0) - 1))}
                                    className="w-7 h-7 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-50">−</button>
                                <input type="number" value={l.qty} min="0"
                                    onChange={(e) => updateQty(l.key, e.target.value)}
                                    onBlur={(e) => onQtyBlur(l.key, e.target.value)}
                                    className="w-12 text-center border border-slate-200 rounded-lg px-1 py-1 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <button onClick={() => updateQty(l.key, (Number(l.qty) || 0) + 1)}
                                    className="w-7 h-7 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-50">+</button>
                                <span className="text-xs text-slate-400 ml-1">× {rs(l.unit_price)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
                    <div className="flex justify-between text-sm text-slate-500 mb-1">
                        <span>Subtotal</span><span>{rs(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500 mb-1">
                        <span>Delivery Charges{area ? ` (${area.name})` : ""}</span>
                        <span>{area ? rs(charges) : "—"}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-slate-800 text-lg mb-4">
                        <span>Total</span><span>{rs(total)}</span>
                    </div>
                    {!area && <p className="text-xs text-amber-600 mb-2">Select a delivery area to place the order.</p>}
                    <Btn onClick={() => place()} disabled={!canPlace}
                        className="w-full bg-brand-600 text-white hover:bg-brand-700 justify-center py-3 disabled:opacity-40">
                        Place Order
                    </Btn>
                    <Btn onClick={() => place(true)} disabled={!canPlace}
                        className="w-full mt-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 justify-center py-3 disabled:opacity-40">
                        Print
                    </Btn>
                </div>
            </aside>

            {modal && (
                <MiniModal
                    item={modal}
                    onClose={() => setModal(null)}
                    onConfirm={(mods, unit) => {
                        setCart((c) => upsert(c, {
                            key: `${modal._key}|${mods.map((m) => m.option.id).sort().join(",")}`,
                            name: modal.name,
                            product_id: modal._kind === "product" ? modal.id : null,
                            deal_id: modal._kind === "deal" ? modal.id : null,
                            unit_price: unit,
                            qty: 1,
                            modifiers: mods,
                        }));
                        setModal(null);
                    }}
                />
            )}
        </div>
    );
}
