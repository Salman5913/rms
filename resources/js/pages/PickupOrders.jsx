import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { Btn, Ico, Pagination, Spinner, inputCls } from "../ui";
import { StatusSelect } from "./WebsiteOrders";
import { formatDateTime } from "../utils";
import ExportModal from "../ExportModal";
import { useDialog } from "../Dialog";
import { useAuth } from "../auth";

/* mini product card (~4x smaller than website card) */
export function MiniCard({ item, onAdd, lines = [], onQty, onQtyBlur }) {
    const hasRequired = (item.modifiers ?? []).some((g) => g.required);
    const qty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const added = lines.length > 0;
    const last = lines[lines.length - 1];
    const stop = (e) => e.stopPropagation();

    // with options, "+" opens the popup so the options are chosen; otherwise it bumps the line
    const inc = () => (item.modifiers?.length ? onAdd(item) : onQty?.(last.key, (Number(last.qty) || 0) + 1));
    const dec = () => onQty?.(last.key, Math.max(0, (Number(last.qty) || 0) - 1));

    return (
        <div onClick={() => onAdd(item)}
            className={"group bg-white rounded-2xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-brand-200 transition " +
                (added ? "border-brand-300 " : "border-slate-200 ") +
                (item._disabled ? "opacity-40 pointer-events-none" : "")}>
            {item.image
                ? <img src={item.image ?? "/placeholder-food.png"} alt={item.name} className="h-32 w-full object-cover bg-slate-100" />
                : <div className="h-32 w-full bg-gradient-to-br from-brand-50 to-slate-100 flex items-center justify-center text-4xl">🍽️</div>}
            <div className="p-3">
                <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                {hasRequired && <p className="text-[11px] text-slate-400">Customization required</p>}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mt-2">
                    <p className="text-sm text-brand-600 font-extrabold">Rs. {Number(item.price).toLocaleString()}</p>
                    {added
                        ? <div className="flex items-center ml-auto">
                            <div onClick={stop} className="flex items-center gap-1 cursor-default">
                                <button type="button" onClick={dec}
                                    className="w-5 h-5 border border-slate-200 rounded-md flex items-center justify-center text-xs leading-none text-slate-600 hover:bg-slate-50">
                                    −
                                </button>
                                {lines.length === 1
                                    ? <input
                                        type="number"
                                        value={last.qty}
                                        onChange={(e) => onQty?.(last.key, e.target.value)}
                                        onBlur={(e) => onQtyBlur?.(last.key, e.target.value)}
                                        className="w-7 h-5 text-center border border-slate-200 rounded-md p-0 text-xs
                                                   [appearance:textfield]
                                                   [&::-webkit-outer-spin-button]:appearance-none
                                                   [&::-webkit-inner-spin-button]:appearance-none"
                                        min="0"
                                    />
                                    : <span className="w-7 h-5 flex items-center justify-center border border-slate-200 rounded-md text-xs">{qty}</span>}
                                <button type="button" onClick={inc}
                                    className="w-5 h-5 border border-slate-200 rounded-md flex items-center justify-center text-xs leading-none text-slate-600 hover:bg-slate-50">
                                    +
                                </button>
                            </div>
                        </div>
                        : <span className="text-xs font-semibold bg-brand-600 text-white rounded-lg px-3 py-1.5 group-hover:bg-brand-700 transition">+ Add</span>}
                </div>
            </div>
        </div>
    );
}

/* compact modifier popup */
export function MiniModal({ item, onClose, onConfirm }) {
    const [sel, setSel] = useState({});
    const groups = item.modifiers ?? [];
    const toggle = (g, oid) => setSel((s) => {
        const cur = s[g._key] ?? [];
        return { ...s, [g._key]: g.type === "single" ? [oid] : cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    });
    const mods = groups.flatMap((g) => (sel[g._key] ?? []).map((oid) => ({
        groupId: g.id, groupName: g.name,
        option: g.options.find((o) => o.id === oid),
    })));
    const unit = Number(item.price) + mods.reduce((s, m) => s + Number(m.option.price), 0);
    const missing = groups.filter((g) => g.required && !(sel[g._key] ?? []).length).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
                <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold">{item.name}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                {groups.map((g) => (
                    <div key={g._key} className="mb-3">
                        <p className="text-xs font-bold text-slate-500 mb-1.5">
                            {g.name} {g.required && <span className="text-red-500">* select 1</span>}
                        </p>
                        <div className="space-y-1">
                            {g.options.map((o) => (
                                <label key={o.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5 cursor-pointer">
                                    <input type={g.type === "single" ? "radio" : "checkbox"} name={g._key}
                                        checked={(sel[g._key] ?? []).includes(o.id)} onChange={() => toggle(g, o.id)}
                                        className="accent-brand-600" />
                                    {o.name}
                                    {Number(o.price) > 0 && <span className="ml-auto text-xs text-slate-400">+{o.price}</span>}
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
                <Btn onClick={() => { if (missing === 0) onConfirm(mods, unit); }}
                    disabled={missing > 0}
                    className="w-full bg-brand-600 text-white justify-center disabled:opacity-40">
                    Add — Rs. {unit.toLocaleString()}
                </Btn>
            </div>
        </div>
    );
}

// ---------- RELIABLE PRINT (iframe) ----------
export const printInvoice = (order, cartSnapshot) => {
    const now = new Date();
    const billDate = now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });

    const charges = Number(order.delivery_charges) || 0;
    const orderTotal = cartSnapshot.reduce(
        (s, l) => s + l.unit_price * (Number(l.qty) || 0),
        0
    );

    const rows = cartSnapshot
        .map((l) => {
            const lineTotal = (l.unit_price * (Number(l.qty) || 0)).toFixed(2);
            const unitPrice = Number(l.unit_price).toFixed(2);
            const mods = l.modifiers?.length
                ? `<div style="font-size:11px;color:#444;padding-left:4px;">+ ${l.modifiers
                    .map((m) => m.option.name)
                    .join(", ")}</div>`
                : "";

            return `
        <tr>
            <td colspan="3" style="padding:5px 0 1px 0;">
                <div style="font-weight:600;">${l.name}</div>
                ${mods}
            </td>
        </tr>
        <tr>
            <td style="padding:0 0 6px 0; font-size:12px; color:#333;">
                ${l.qty} x ${unitPrice}
            </td>
            <td style="padding:0 0 6px 0;"></td>
            <td style="padding:0 0 6px 0; text-align:right; font-weight:600;">
                ${lineTotal}
            </td>
        </tr>
    `;
        })
        .join("");

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${order.order_number}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: 'Courier New', Courier, monospace;
        font-size: 13px;
        color: #000;
        background: #fff;
        width: 280px;               /* ideal for 80mm thermal */
        max-width: 280px;
        margin: 0 auto;
        padding: 8px 6px;
        line-height: 1.35;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 1px;
        margin-bottom: 2px;
    }
    .order-no {
        font-size: 12px;
        margin-bottom: 10px;
    }
    .meta {
        font-size: 12px;
        margin-bottom: 8px;
    }
    hr {
        border: none;
        border-top: 1px dashed #000;
        margin: 8px 0;
    }
    table {
        width: 100%;
        border-collapse: collapse;
    }
    .summary-row {
        display: flex;
        justify-content: space-between;
        margin: 3px 0;
        font-size: 13px;
    }
    .total-row {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid #000;
        font-size: 15px;
        font-weight: 700;
    }
    .footer {
        text-align: center;
        font-size: 11px;
        margin-top: 12px;
        color: #333;
    }

    /* Thermal printer friendly page size */
    @page {
        size: 80mm auto;
        margin: 2mm;
    }

    @media print {
        body {
            width: 72mm;
            max-width: 72mm;
            padding: 2mm;
        }
    }
</style>
</head>
<body>
<div class="center">
    <div class="title">${{ dinein: "DINE-IN ORDER", delivery: "HOME DELIVERY" }[order.type] ?? "PICKUP ORDER"}</div>
    <div class="order-no">Order # ${order.order_number}</div>
</div>

<div class="meta">
    <div><b>Bill Date:</b> ${billDate}</div>
    ${order.delivery_area ? `<div><b>Delivery Area:</b> ${order.delivery_area}</div>` : ""}
</div>

<hr/>

<table>
    <tbody>
        ${rows}
    </tbody>
</table>

<hr/>

<div class="summary-row">
    <span>Subtotal</span>
    <span>Rs. ${orderTotal.toFixed(2)}</span>
</div>

${charges > 0 ? `<div class="summary-row">
    <span>Delivery Charges</span>
    <span>Rs. ${charges.toFixed(2)}</span>
</div>` : ""}

<div class="total-row">
    <span>TOTAL</span>
    <span>Rs. ${(orderTotal + charges).toFixed(2)}</span>
</div>

<hr/>

<div class="footer">
    Thank you!<br>
    Please collect your order.
</div>
</body>
</html>
`;

    // Hidden iframe method (most reliable)
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);
    }, 350);
};

/* menu grouped into full-width, collapsible category sections */
export function CategoryMenu({ items, onAdd, forceOpen = false, cart = [], onQty, onQtyBlur }) {
    const [closed, setClosed] = useState({});
    const groups = [];
    const byName = {};
    items.forEach((i) => {
        const name = i._group ?? "Other";
        if (!byName[name]) { byName[name] = { name, items: [] }; groups.push(byName[name]); }
        byName[name].items.push(i);
    });

    if (groups.length === 0) return <p className="text-center text-slate-300 py-16">No items found</p>;

    return (
        <div className="space-y-3">
            {groups.map((g) => {
                const open = forceOpen || !closed[g.name];
                return (
                    <div key={g.name} className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <button type="button" onClick={() => setClosed((c) => ({ ...c, [g.name]: !c[g.name] }))}
                            className="w-full flex items-center justify-between px-5 py-3.5 text-left">
                            <span className="font-bold text-slate-800">
                                {g.name}
                                <span className="ml-2 text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2 py-0.5">{g.items.length}</span>
                            </span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                className={"w-5 h-5 text-slate-400 transition-transform " + (open ? "rotate-180" : "")} aria-hidden="true">
                                <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>
                        {open && (
                            <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-4 px-5 pb-5">
                                {g.items.map((item) => (
                                    <MiniCard key={item._key} item={item} onAdd={onAdd} onQty={onQty} onQtyBlur={onQtyBlur}
                                        lines={cart.filter((l) => String(l.key).split("|")[0] === item._key)} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ---------------- pickup orders listing ---------------- */
export default function PickupOrders() {
    const { can } = useAuth();
    const allowCreate = can("pickup-orders", "create");
    const allowEdit = can("pickup-orders", "edit");
    const allowDelete = can("pickup-orders", "delete");
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
        api.get("/admin/orders", { params: { type: "pickup", search: s, page: p } }).then((r) => {
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
                <h2 className="text-xl font-extrabold text-slate-800">Pickup Orders</h2>
                <div className="flex gap-2">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # / customer…" className={inputCls + " !w-64"} />
                    <Btn
                        onClick={() => setExportOpen(true)}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                        <Ico n="download" /> Export
                    </Btn>
                    {allowDelete && <Btn onClick={bulkDelete} disabled={!selected.length}
                        className="bg-red-50 text-red-600 border border-red-200 disabled:opacity-40"><Ico n="trash" /> Trash ({selected.length})</Btn>}
                    {allowCreate && <Btn onClick={() => nav("create")} className="bg-brand-600 text-white hover:bg-brand-700"><Ico n="plus" /> New Pickup Order</Btn>}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand-600" /></th>
                            <th className="p-3 font-semibold">Order #</th>
                            <th className="p-3 font-semibold">Items</th>
                            {/* <th className="p-3 font-semibold">Customer</th>
                            <th className="p-3 font-semibold">Phone</th> */}
                            <th className="p-3 font-semibold">Total</th>
                            {/* <th className="p-3 font-semibold">Status</th> */}
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
                                {/* <td className="p-3">{o.customer_name}</td>
                                <td className="p-3">{o.customer_phone ?? "—"}</td> */}
                                <td className="p-3 font-bold">Rs. {Number(o.total).toLocaleString()}</td>
                                {/* <td className="p-3"><StatusSelect order={o} onChanged={load} /></td> */}
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
                        {data.data.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-300">No pickup orders yet</td></tr>}
                    </tbody>
                </table>
            </div>
            <Pagination data={data} onPage={goTo} />
            {exportOpen && <ExportModal title="Pickup Orders" name="Pickup-Orders" url="/api/admin/orders?type=pickup&export=csv" onClose={() => setExportOpen(false)} />}
        </div>
    );
}

/* ---------------- pickup order create (website-style menu) ---------------- */
export function PickupCreate() {
    const [home, setHome] = useState(null);
    const [q, setQ] = useState("");
    const [cart, setCart] = useState([]);
    const [modal, setModal] = useState(null);
    const [customer, setCustomer] = useState({ name: "", phone: "" });
    const nav = useNavigate();
    const dialog = useDialog();

    useEffect(() => {
        api.get("/home").then((r) => setHome(r.data));
    }, []);

    const items = useMemo(() => {
        if (!home) return [];
        const prods = home.categories.flatMap((c) =>
            c.products.map((p) => ({
                ...p,
                _kind: "product",
                _group: c.name,
                _key: `p${p.id}`,
                modifiers: [
                    ...(p.options?.length
                        ? [{
                            id: -1,
                            _key: `p${p.id}-opt`,
                            name: p.options_title || "Options",
                            type: "single",
                            required: true,
                            options: p.options,
                        }]
                        : []),
                    ...(p.extras?.length
                        ? [{
                            id: -2,
                            _key: `p${p.id}-ext`,
                            name: p.extras_title || "Extras",
                            type: "multiple",
                            required: false,
                            options: p.extras,
                        }]
                        : []),
                ],
                _disabled: ["website", "unavailable"].includes(p.availability),
            }))
        );
        const deals = home.deals.map((d) => ({
            ...d,
            _kind: "deal",
            _group: "Deals",
            _key: `d${d.id}`,
            modifiers: [
                ...(d.options?.length
                    ? [{
                        id: -1,
                        _key: `d${d.id}-opt`,
                        name: d.options_title || "Options",
                        type: "single",
                        required: true,
                        options: d.options,
                    }]
                    : []),
                ...(d.extras?.length
                    ? [{
                        id: -2,
                        _key: `d${d.id}-ext`,
                        name: d.extras_title || "Extras",
                        type: "multiple",
                        required: false,
                        options: d.extras,
                    }]
                    : []),
            ],
            _disabled: false,
        }));
        return [...deals, ...prods].filter((i) =>
            i.name.toLowerCase().includes(q.toLowerCase())
        );
    }, [home, q]);
    console.log('items', items)

    if (!home) return <Spinner />;

    const add = (item) => {
        if (item.modifiers.length) setModal(item);
        else
            setCart((c) =>
                upsert(c, {
                    key: item._key,
                    name: item.name,
                    product_id: item._kind === "product" ? item.id : null,
                    deal_id: item._kind === "deal" ? item.id : null,
                    unit_price: Math.trunc(Number(item.price)),
                    qty: 1,
                    modifiers: [],
                })
            );
    };

    const upsert = (cart, line) => {
        const ex = cart.find((l) => l.key === line.key);
        return ex
            ? cart.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l))
            : [...cart, line];
    };

    const total = cart.reduce((s, l) => s + l.unit_price * (Number(l.qty) || 0), 0);

    const place = async (print = false) => {
        if (!cart.length) return dialog.alert("Add at least one item to the cart before placing the order.", { title: "Cart is empty", variant: "warning" });

        // Snapshot the cart before we clear it
        const cartSnapshot = cart.map((l) => ({ ...l }));

        try {
            const r = await api.post("/admin/orders", {
                customer_name: customer.name,
                customer_phone: customer.phone,
                type: 'pickup',
                items: cart.map(({ key, ...l }) => l),
            });

            // Print the invoice
            if (print) printInvoice(r.data, cartSnapshot);

            // Clear cart and stay on the page
            setCart([]);
            setQ(""); // optional: also clear the search
        } catch (err) {
            console.error(err);
            dialog.alert("The order could not be placed. Try again.", { title: "Order failed", variant: "danger" });
        }
    };

    // ---------- quantity helpers ----------
    const updateQty = (key, rawValue) => {
        if (rawValue === "") {
            setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: "" } : x)));
            return;
        }
        const num = Math.max(0, parseInt(rawValue, 10) || 0);
        setCart((c) =>
            c
                .map((x) => (x.key === key ? { ...x, qty: num } : x))
                .filter((x) => x.qty > 0)
        );
    };

    const onQtyBlur = (key, rawValue) => {
        const num = Math.max(0, parseInt(rawValue, 10) || 0);
        setCart((c) =>
            c
                .map((x) => (x.key === key ? { ...x, qty: num } : x))
                .filter((x) => x.qty > 0)
        );
    };

    const itemCount = cart.reduce((s, l) => s + (Number(l.qty) || 0), 0);

    return (
        <div className="flex gap-6 items-start">
            {/* ---------- menu ---------- */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-800">New Pickup Order</h2>
                        <p className="text-sm text-slate-400">Tap a dish to add it to the order</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="🔍 Search menu…"
                            className={inputCls + " !w-64"}
                        />
                        <Btn onClick={() => nav("/orders/pickup")} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
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
                                    Rs. {((Number(l.unit_price) || 0) * (Number(l.qty) || 0)).toLocaleString()}
                                </b>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    onClick={() => updateQty(l.key, Math.max(0, (Number(l.qty) || 0) - 1))}
                                    className="w-7 h-7 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-50"
                                >
                                    −
                                </button>
                                <input
                                    type="number"
                                    value={l.qty}
                                    onChange={(e) => updateQty(l.key, e.target.value)}
                                    onBlur={(e) => onQtyBlur(l.key, e.target.value)}
                                    className="w-12 text-center border border-slate-200 rounded-lg px-1 py-1 text-sm
                                               [appearance:textfield]
                                               [&::-webkit-outer-spin-button]:appearance-none
                                               [&::-webkit-inner-spin-button]:appearance-none"
                                    min="0"
                                />
                                <button
                                    onClick={() => updateQty(l.key, (Number(l.qty) || 0) + 1)}
                                    className="w-7 h-7 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-50"
                                >
                                    +
                                </button>
                                <span className="text-xs text-slate-400 ml-1">× Rs. {Number(l.unit_price).toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
                    <div className="flex justify-between text-sm text-slate-500 mb-1">
                        <span>Subtotal</span><span>Rs. {total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-slate-800 text-lg mb-4">
                        <span>Total</span><span>Rs. {total.toLocaleString()}</span>
                    </div>
                    <Btn
                        onClick={() => place()}
                        disabled={!cart.length}
                        className="w-full bg-brand-600 text-white hover:bg-brand-700 justify-center py-3 disabled:opacity-40"
                    >
                        Place Order
                    </Btn>
                    <Btn
                        onClick={() => place(true)}
                        disabled={!cart.length}
                        className="w-full mt-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 justify-center py-3 disabled:opacity-40"
                    >
                        Print
                    </Btn>
                </div>
            </aside>

            {modal && (
                <MiniModal
                    item={modal}
                    onClose={() => setModal(null)}
                    onConfirm={(mods, unit) => {
                        setCart((c) =>
                            upsert(c, {
                                key: `${modal._key}|${mods
                                    .map((m) => m.option.id)
                                    .sort()
                                    .join(",")}`,
                                name: modal.name,
                                product_id: modal._kind === "product" ? modal.id : null,
                                deal_id: modal._kind === "deal" ? modal.id : null,
                                unit_price: unit,
                                qty: 1,
                                modifiers: mods,
                            })
                        );
                        setModal(null);
                    }}
                />
            )}
        </div>
    );
}
