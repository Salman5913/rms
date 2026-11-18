import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";
import { Btn, Select, Spinner, inputCls } from "../ui";
import { useDialog } from "../Dialog";
import { useAuth, useRedirectBack } from "../auth";
import { orderModule } from "../modules";
import { CategoryMenu, MiniModal, printInvoice } from "./PickupOrders";
import { CustomerCard, customerOf, missingCustomerField, useRiders } from "../delivery";

const TYPE_META = {
    website: { title: "Website", back: "/orders/website" },
    pickup: { title: "Pickup", back: "/orders/pickup" },
    dinein: { title: "Dine-In", back: "/orders/dinein" },
    delivery: { title: "Home Delivery", back: "/orders/delivery" },
};

/* same option/extra groups the create pages build */
const groupsFor = (x, prefix) => [
    ...(x.options?.length
        ? [{ id: -1, _key: `${prefix}${x.id}-opt`, name: x.options_title || "Options", type: "single", required: true, options: x.options }]
        : []),
    ...(x.extras?.length
        ? [{ id: -2, _key: `${prefix}${x.id}-ext`, name: x.extras_title || "Extras", type: "multiple", required: false, options: x.extras }]
        : []),
];

/* turn a saved order item back into a cart line (same key format as the create pages) */
const toCartLine = (i, menuByKey) => {
    const base = i.product_id ? `p${i.product_id}` : i.deal_id ? `d${i.deal_id}` : `i${i.id}`;
    const modifiers = (i.modifiers ?? []).map((m) =>
        m.option ? m : { groupId: m.groupId ?? null, groupName: m.groupName ?? "", option: { id: m.id, name: m.name, price: m.price ?? 0 } }
    );
    const hasGroups = (menuByKey[base]?.modifiers?.length ?? 0) > 0 || modifiers.length > 0;
    const key = hasGroups ? `${base}|${modifiers.map((m) => m.option.id).sort().join(",")}` : base;
    return {
        key,
        name: i.name,
        product_id: i.product_id ?? null,
        deal_id: i.deal_id ?? null,
        unit_price: Number(i.unit_price),
        qty: Number(i.qty),
        modifiers,
    };
};

/* ---------------- order edit (website / pickup / dine-in) ---------------- */
export default function OrderEdit() {
    const { id } = useParams();
    const [home, setHome] = useState(null);
    const [order, setOrder] = useState(null);
    const [q, setQ] = useState("");
    const [cart, setCart] = useState(null);
    const [modal, setModal] = useState(null);
    const [saving, setSaving] = useState(false);
    const [customer, setCustomer] = useState(null);
    const [areas, setAreas] = useState([]);
    const [areaId, setAreaId] = useState(null);
    const riders = useRiders();
    const nav = useNavigate();
    const dialog = useDialog();
    const { can } = useAuth();
    const redirectBack = useRedirectBack();

    useEffect(() => {
        api.get("/home").then((r) => setHome(r.data));
        api.get(`/admin/orders/${id}`).then((r) => {
            // the order's type decides which Sales sub-module guards this page
            if (!can(orderModule(r.data.type), "edit")) return redirectBack();
            setOrder(r.data);
            setCustomer(customerOf(r.data));
            setAreaId(r.data.delivery_area_id ?? null);
            // active areas, plus the order's own area even if it has since been disabled
            if (["delivery", "website"].includes(r.data.type)) {
                api.get("/admin/delivery-areas", { params: { all: 1 } })
                    .then((a) => setAreas(a.data.filter((x) => x.status || x.id === r.data.delivery_area_id)));
            }
        });
    }, [id]); // eslint-disable-line

    const menu = useMemo(() => {
        if (!home) return [];
        const prods = home.categories.flatMap((c) =>
            c.products.map((p) => ({
                ...p,
                _kind: "product",
                _group: c.name,
                _key: `p${p.id}`,
                modifiers: groupsFor(p, "p"),
                _disabled: ["website", "unavailable"].includes(p.availability),
            }))
        );
        const deals = home.deals.map((d) => ({
            ...d,
            _kind: "deal",
            _group: "Deals",
            _key: `d${d.id}`,
            modifiers: groupsFor(d, "d"),
            _disabled: false,
        }));
        return [...deals, ...prods];
    }, [home]);

    // pre-fill the cart with the order's existing items once both are loaded
    useEffect(() => {
        if (!home || !order || cart) return;
        const byKey = Object.fromEntries(menu.map((m) => [m._key, m]));
        setCart(order.items.map((i) => toCartLine(i, byKey)));
    }, [home, order, menu, cart]);

    const items = useMemo(
        () => menu.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())),
        [menu, q]
    );

    if (!home || !order || !cart) return <Spinner />;

    const meta = TYPE_META[order.type] ?? TYPE_META.pickup;
    const locked = order.type === "website" && order.status !== "RECEIVED";

    if (locked) {
        return (
            <div className="max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-extrabold text-slate-800 mb-2">Order {order.order_number} can't be edited</h2>
                <p className="text-sm text-slate-500 mb-4">You can edit website orders only while their status is Received.</p>
                <Btn onClick={() => nav(meta.back)} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">Back</Btn>
            </div>
        );
    }

    const upsert = (cart, line) => {
        const ex = cart.find((l) => l.key === line.key);
        return ex
            ? cart.map((l) => (l.key === line.key ? { ...l, qty: (Number(l.qty) || 0) + 1 } : l))
            : [...cart, line];
    };

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

    // delivery and website orders carry customer details, a rider and a delivery area
    const isDelivery = ["delivery", "website"].includes(order.type);
    const areaRequired = order.type === "delivery";

    // same area keeps the charges the order was placed with; another area uses its current charges
    const sameArea = areaId === (order.delivery_area_id ?? null);
    const selectedArea = areas.find((a) => a.id === areaId);
    const areaName = sameArea ? order.delivery_area : selectedArea?.name;
    const charges = !isDelivery || sameArea
        ? Number(order.delivery_charges) || 0
        : Number(selectedArea?.delivery_charges ?? 0);

    // total is the order amount only; delivery charges are shown separately
    const total = cart.reduce((s, l) => s + l.unit_price * (Number(l.qty) || 0), 0);
    const missing = !isDelivery ? null
        : missingCustomerField(customer)
        ?? (areaRequired && !areaId ? ["Delivery area required", "Select a delivery area before updating the order."] : null);

    const save = async (print = false) => {
        if (!cart.length) return dialog.alert("Add at least one item to the cart before updating the order.", { title: "Cart is empty", variant: "warning" });
        if (missing) return dialog.alert(missing[1].replace("placing", "updating"), { title: missing[0], variant: "warning" });

        const cartSnapshot = cart.map((l) => ({ ...l }));
        setSaving(true);
        try {
            const r = await api.post(`/admin/orders/${order.id}`, {
                items: cart.map(({ key, ...l }) => l),
                ...(isDelivery ? { ...customer, delivery_area_id: areaId } : {}),
            });
            if (print) printInvoice(r.data, cartSnapshot);
            nav(meta.back);
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.message ?? "The order could not be updated. Try again.";
            dialog.alert(msg, { title: "Update failed", variant: "danger" });
        } finally {
            setSaving(false);
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
                        <h2 className="text-xl font-extrabold text-slate-800">Edit {meta.title} Order {order.order_number}</h2>
                        <p className="text-sm text-slate-400">Tap a dish to add it to the order</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="🔍 Search menu…"
                            className={inputCls + " !w-64"}
                        />
                        <Btn onClick={() => nav(meta.back)} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
                            Back
                        </Btn>
                    </div>
                </div>

                <CategoryMenu items={items} onAdd={add} forceOpen={!!q} cart={cart} onQty={updateQty} onQtyBlur={onQtyBlur} />
            </div>

            {/* ---------- sidebar: (delivery) customer details + order summary ---------- */}
            <aside className={"w-[360px] flex-none sticky top-24 max-h-[calc(100vh-8rem)] " + (isDelivery ? "overflow-y-auto space-y-4 pb-1" : "flex flex-col")}>
                {isDelivery && <CustomerCard value={customer} onChange={setCustomer} riders={riders} order={order}
                    areaRequired={areaRequired}
                    areaSelect={<Select value={areaId} onChange={(v) => setAreaId(v === "" || v == null ? null : Number(v))}
                        placeholder={areaRequired ? "Select delivery area" : "No delivery area"} clearable={!areaRequired}
                        options={areas.map((a) => ({ value: a.id, label: `${a.name} (Rs. ${Number(a.delivery_charges).toLocaleString()})` }))} />} />}

                <div className={"bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col " + (isDelivery ? "" : "min-h-0 flex-1")}>
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Order summary</h3>
                    <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2.5 py-1">
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                    </span>
                </div>

                <div className={"px-5 py-2 min-h-[120px] " + (isDelivery ? "" : "flex-1 overflow-y-auto")}>
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
                    <div className={"flex justify-between font-extrabold text-slate-800 text-lg " + (isDelivery || charges > 0 ? "mb-1" : "mb-4")}>
                        <span>Total</span><span>Rs. {total.toLocaleString()}</span>
                    </div>
                    {(isDelivery || charges > 0) && (
                        <div className="flex justify-between text-sm text-slate-500 mb-4">
                            <span>Delivery Charges{areaName ? ` (${areaName})` : ""}</span>
                            <span>{areaId || charges > 0 ? `Rs. ${charges.toLocaleString()}` : "—"}</span>
                        </div>
                    )}
                    {missing && <p className="text-xs text-amber-600 mb-2">Fill in the customer's name, phone and address to update the order.</p>}
                    <Btn
                        onClick={() => save()}
                        disabled={!cart.length || !!missing || saving}
                        className="w-full bg-brand-600 text-white hover:bg-brand-700 justify-center py-3 disabled:opacity-40"
                    >
                        Update Order
                    </Btn>
                    <Btn
                        onClick={() => save(true)}
                        disabled={!cart.length || !!missing || saving}
                        className="w-full mt-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 justify-center py-3 disabled:opacity-40"
                    >
                        Print
                    </Btn>
                </div>
                </div>
            </aside>

            {modal && (
                <MiniModal
                    item={modal}
                    onClose={() => setModal(null)}
                    onConfirm={(mods, unit) => {
                        setCart((c) =>
                            upsert(c, {
                                key: `${modal._key}|${mods.map((m) => m.option.id).sort().join(",")}`,
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
