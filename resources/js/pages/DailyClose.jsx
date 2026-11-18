import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { useDialog } from "../Dialog";
import { Btn, Field, Modal, Pagination, Spinner, inputCls } from "../ui";
import { formatDateTime, localToday } from "../utils";

const MODULE = "daily-close";

const rs = (v) => `Rs. ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const money = (v) => Number(v ?? 0).toFixed(2);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const errorMessage = (err, fallback) =>
    Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message ?? fallback;

/** printable sections: key, label, ticked by default */
const SECTIONS = [
    { key: "sales", label: "Sales by order type", on: true },
    { key: "items", label: "Item-wise sales", on: true },
    { key: "charges", label: "Delivery charges", on: true },
    { key: "cancelled", label: "Cancelled orders", on: false },
];

/** short type names for the 80mm print */
const PRINT_TYPE = { pickup: "Pickup", dinein: "Dine In", website: "Website", delivery: "Home Delivery" };
const TYPE_LABEL = { pickup: "Pickup", dinein: "Dine In", website: "Website", delivery: "Home Delivery" };
const STATUS_LABEL = { RECEIVED: "Received", PREPARING: "Preparing", READY: "Ready", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled" };

/* ---------------- 80mm thermal print (same style as printInvoice) ---------------- */
function printDailyClose(d, ticked) {
    const s = d.summary;
    const closed = d.status === "closed";
    const row = (label, value, cls = "summary-row", note = "") =>
        `<div class="${cls}"><span>${esc(label)}${note ? `<div class="note">${esc(note)}</div>` : ""}</span><span class="amt">${esc(value)}</span></div>`;
    const money2 = (v) => `Rs. ${money(v)}`;
    const head = (t) => `<hr/><div class="bold" style="margin-bottom:4px;">${t}</div>`;
    const parts = [];

    // print order: item-wise sales, sales by type, total sales, (cancelled), delivery charges last
    if (ticked.items) {
        parts.push(head("ITEM-WISE SALES") + (s.items.length
            ? `<table><tbody>${s.items.map((i) => `<tr><td style="padding:2px 0;">${esc(i.name)}</td><td style="text-align:right;padding:2px 4px;">${i.qty}</td><td class="amt" style="text-align:right;padding:2px 0;">${money(i.amount)}</td></tr>`).join("")}</tbody></table>`
            : "<div>No items</div>"));
    }
    if (ticked.sales) {
        parts.push(head("SALES BY ORDER TYPE")
            // website / home delivery: short name on the row, the delivered rule on a small second line
            + s.sales_by_type.map((t) => row(`${PRINT_TYPE[t.type] ?? t.label} (${t.orders})`, money2(t.amount), "summary-row",
                ["website", "delivery"].includes(t.type) ? "delivered only" : "")).join("")
            + row("TOTAL SALES", money2(s.total_sales), "total-row"));
    }
    if (ticked.cancelled) {
        parts.push(head("CANCELLED ORDERS") + s.cancelled.map((c) => row(`${c.label} (${c.orders})`, money2(c.amount))).join(""));
    }
    if (ticked.sales || ticked.charges) {
        // delivery charges are their own block, never inside total sales
        parts.push(head("DELIVERY CHARGES (DELIVERED)")
            + row("Delivery Charges", money2(s.delivery_charges))
            + (ticked.charges
                ? `<div class="bold" style="font-size:12px;margin-top:4px;">By area</div>`
                + (s.delivery_charges_by_area.map((a) => row(`${a.name} (${a.orders})`, money2(a.amount))).join("") || "<div>None</div>")
                + `<div class="bold" style="font-size:12px;margin-top:4px;">By rider</div>`
                + (s.delivery_charges_by_rider.map((r) => row(`${r.name} (${r.orders})`, money2(r.amount))).join("") || "<div>None</div>")
                : "")
            + (ticked.sales ? row("Total Collected", money2(s.total_collected), "total-row") : ""));
    }
    if (closed && d.close.cash_counted !== null) {
        const diff = Number(d.close.cash_counted) - Number(s.total_collected);
        parts.push(head("CASH") + row("Cash Counted", money2(d.close.cash_counted)) + row("Total Collected", money2(s.total_collected)) + row("Difference", money2(diff)));
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Daily Close ${esc(d.date)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #000; background: #fff;
        width: 280px; max-width: 280px; margin: 0 auto; padding: 8px 6px; line-height: 1.35; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .title { font-size: 15px; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
    .meta { font-size: 12px; margin-bottom: 8px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin: 3px 0; font-size: 13px; }
    .amt { white-space: nowrap; }
    .note { font-size: 11px; color: #333; padding-left: 8px; }
    .total-row { display: flex; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px solid #000; font-size: 15px; font-weight: 700; }
    .footer { text-align: center; font-size: 11px; margin-top: 12px; color: #333; }
    @page { size: 80mm auto; margin: 2mm; }
    @media print { body { width: 72mm; max-width: 72mm; padding: 2mm; } }
</style>
</head>
<body>
<div class="center">
    <div class="title">${esc(d.restaurant)}</div>
    <div class="bold">DAILY CLOSE</div>
</div>
<div class="meta">
    <div><b>Business Date:</b> ${esc(d.date)}</div>
    ${closed
        ? `<div><b>Closed By:</b> ${esc(d.close.closed_by?.name ?? "—")}</div><div><b>Closed At:</b> ${esc(new Date(d.close.closed_at).toLocaleString("en-GB"))}</div>`
        : `<div class="bold">NOT CLOSED</div>`}
    <div><b>Orders Counted:</b> ${s.orders_counted}</div>
</div>
${parts.join("")}
<hr/>
<div class="footer">Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`;

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 350);
}

/* ---------------- small building blocks ---------------- */
function StatusBadge({ d }) {
    if (d.status === "closed") {
        return <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full">
            ✅ Closed by {d.close.closed_by?.name ?? "—"} · {formatDateTime(d.close.closed_at)}
        </span>;
    }
    if (d.status === "reopened") {
        return <span className="bg-sky-50 text-sky-700 text-xs font-bold px-3 py-1.5 rounded-full">
            🔓 Reopened by {d.close.reopened_by?.name ?? "—"} · {formatDateTime(d.close.reopened_at)}
        </span>;
    }
    return <span className="bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">🟡 Open</span>;
}

function Section({ title, sectionKey, ticked, onTick, children }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <label className="flex items-center gap-2 mb-3 cursor-pointer w-fit">
                <input type="checkbox" className="accent-brand-600" checked={ticked[sectionKey]} onChange={() => onTick(sectionKey)} />
                <h3 className="font-bold text-slate-700">{title}</h3>
                <span className="text-xs text-slate-400">(print)</span>
            </label>
            {children}
        </div>
    );
}

function Table({ head, rows, foot }) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                    {head.map((h, i) => <th key={h} className={"py-2 font-semibold " + (i ? "text-right" : "")}>{h}</th>)}
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && <tr><td colSpan={head.length} className="py-4 text-center text-slate-300">Nothing to show</td></tr>}
                {rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-slate-100 last:border-0">
                        {r.map((c, i) => <td key={i} className={"py-2 " + (i ? "text-right" : "text-slate-700")}>{c}</td>)}
                    </tr>
                ))}
            </tbody>
            {foot && (
                <tfoot>
                    <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
                        {foot.map((c, i) => <td key={i} className={"py-2 " + (i ? "text-right" : "")}>{c}</td>)}
                    </tr>
                </tfoot>
            )}
        </table>
    );
}

/* ---------------- page ---------------- */
export default function DailyClose() {
    const { can } = useAuth();
    const dialog = useDialog();
    const [date, setDate] = useState(localToday());
    const [d, setD] = useState(null);
    const [ticked, setTicked] = useState(() => Object.fromEntries(SECTIONS.map((s) => [s.key, s.on])));
    const [modal, setModal] = useState(null); // "close" | "reopen"
    const [form, setForm] = useState({ cash_counted: "", notes: "", reason: "" });
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState(null);

    const load = (dt = date) => api.get("/admin/daily-close", { params: { date: dt } }).then((r) => setD(r.data));
    const loadHistory = (p = 1) => api.get("/admin/daily-closes", { params: { page: p } }).then((r) => setHistory(r.data));

    useEffect(() => { setD(null); load(date); }, [date]); // eslint-disable-line
    useEffect(() => { loadHistory(1); }, []);

    const tick = (k) => setTicked((t) => ({ ...t, [k]: !t[k] }));
    const openModal = (kind) => { setForm({ cash_counted: "", notes: "", reason: "" }); setModal(kind); };

    const closeDay = async () => {
        setSaving(true);
        try {
            await api.post("/admin/daily-close", {
                date, notes: form.notes || null,
                cash_counted: form.cash_counted === "" ? null : Number(form.cash_counted),
            });
            setModal(null);
        } catch (err) {
            setModal(null);
            dialog.alert(errorMessage(err, "The day could not be closed. Try again."), { title: "Can't close day", variant: "warning" });
        } finally {
            setSaving(false);
            load(); loadHistory(1);
        }
    };

    const reopenDay = async () => {
        if (!form.reason.trim()) return;
        setSaving(true);
        try {
            await api.post(`/admin/daily-close/${d.close.id}/reopen`, { reason: form.reason });
            setModal(null);
        } catch (err) {
            dialog.alert(errorMessage(err, "The day could not be reopened. Try again."), { title: "Can't reopen day", variant: "warning" });
        } finally {
            setSaving(false);
            load(); loadHistory(1);
        }
    };

    if (!d) return <Spinner />;

    const s = d.summary;
    const closed = d.status === "closed";
    const blocked = d.blocking_orders.length > 0;
    const canClose = can(MODULE, "create") && !closed && !d.is_future;
    const cash = closed && d.close.cash_counted !== null
        ? { counted: Number(d.close.cash_counted), diff: Number(d.close.cash_counted) - Number(s.total_collected) }
        : null;

    return (
        <div className="space-y-6">
            {/* header: date + status + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-extrabold text-slate-800">Daily Close</h2>
                    <input type="date" value={date} max={localToday()} onChange={(e) => e.target.value && setDate(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                    <StatusBadge d={d} />
                </div>
                <div className="flex gap-2">
                    <Btn onClick={() => printDailyClose(d, ticked)} disabled={!Object.values(ticked).some(Boolean)}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">🖨️ Print selected</Btn>
                    {closed && can(MODULE, "edit") && (
                        <Btn onClick={() => openModal("reopen")} className="bg-amber-500 hover:bg-amber-600 text-white">Reopen Day</Btn>
                    )}
                    {canClose && (
                        <Btn onClick={() => openModal("close")} disabled={blocked}
                            title={blocked ? "Deliver or cancel the pending orders first" : undefined}
                            className="bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">Close Day</Btn>
                    )}
                </div>
            </div>

            {d.status === "reopened" && d.close.reopen_reason && (
                <div className="bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-2xl px-5 py-3">
                    <b>Reopen reason:</b> {d.close.reopen_reason}
                </div>
            )}

            {/* blocking orders */}
            {blocked && !d.is_future && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
                    <p className="text-sm font-bold text-red-700 mb-2">
                        These orders are still pending. Mark them Delivered or Cancelled before closing the day.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {d.blocking_orders.map((o) => (
                            <Link key={o.id} to={`/orders/${o.id}`}
                                className="bg-white border border-red-200 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-red-100">
                                {o.order_number} · {TYPE_LABEL[o.type] ?? o.type} · {STATUS_LABEL[o.status] ?? o.status}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* placed after close */}
            {d.placed_after_close.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                    <p className="text-sm font-bold text-amber-800 mb-2">
                        {d.placed_after_close.length} order(s) were placed after this day was closed. They are not in the figures below.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {d.placed_after_close.map((o) => (
                            <Link key={o.id} to={`/orders/${o.id}`}
                                className="bg-white border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-amber-100">
                                {o.order_number} · {TYPE_LABEL[o.type] ?? o.type} · {rs(o.total)}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    ["Total Sales", rs(s.total_sales), "!border-t-brand-600"],
                    ["Total Orders Counted", s.orders_counted, "!border-t-emerald-500"],
                    ["Delivery Charges Collected", rs(s.delivery_charges), "!border-t-amber-400"],
                ].map(([label, val, accent]) => (
                    <div key={label} className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + accent}>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-xl font-extrabold text-slate-800 mt-1">{val}</p>
                    </div>
                ))}
            </div>

            {/* cash counted vs collected */}
            {cash && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-xs text-slate-400">Cash counted</p><p className="font-extrabold text-slate-800 text-lg">{rs(cash.counted)}</p></div>
                    <div><p className="text-xs text-slate-400">Total collected (sales + delivery charges)</p><p className="font-extrabold text-slate-800 text-lg">{rs(s.total_collected)}</p></div>
                    <div><p className="text-xs text-slate-400">Difference</p>
                        <p className={"font-extrabold text-lg " + (cash.diff === 0 ? "text-emerald-600" : cash.diff > 0 ? "text-sky-600" : "text-red-600")}>
                            {cash.diff > 0 ? "+" : ""}{rs(cash.diff)}
                        </p>
                    </div>
                </div>
            )}
            {closed && d.close.notes && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 text-sm text-slate-600"><b>Notes:</b> {d.close.notes}</div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Section title="Sales by order type" sectionKey="sales" ticked={ticked} onTick={tick}>
                    <Table head={["Type", "Orders", "Amount"]}
                        rows={s.sales_by_type.map((t) => [t.label, t.orders, rs(t.amount)])}
                        foot={["Total sales", s.orders_counted, rs(s.total_sales)]} />
                    <div className="flex justify-between text-sm text-slate-500 mt-3 pt-3 border-t border-dashed border-slate-200">
                        <span>Delivery charges (not in sales)</span><span className="font-semibold">{rs(s.delivery_charges)}</span>
                    </div>
                </Section>

                <Section title="Item-wise sales" sectionKey="items" ticked={ticked} onTick={tick}>
                    <div className="max-h-80 overflow-y-auto">
                        <Table head={["Item", "Qty", "Amount"]} rows={s.items.map((i) => [i.name, i.qty, rs(i.amount)])} />
                    </div>
                </Section>

                <Section title="Delivery charges (delivered website & home delivery)" sectionKey="charges" ticked={ticked} onTick={tick}>
                    {/* by area, by rider, then the totals */}
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">By area</p>
                    <Table head={["Area", "Orders", "Charges"]} rows={s.delivery_charges_by_area.map((a) => [a.name, a.orders, rs(a.amount)])} />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-4 mb-1">By rider</p>
                    <Table head={["Rider", "Orders", "Charges"]} rows={s.delivery_charges_by_rider.map((r) => [r.name, r.orders, rs(r.amount)])} />
                    <div className="flex justify-between text-sm font-bold text-slate-800 mt-3 pt-3 border-t-2 border-slate-200">
                        <span>Total delivery charges</span><span>{rs(s.delivery_charges)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-800 mt-2 pt-2 border-t border-slate-200">
                        <span>Total collected (sales + delivery charges)</span><span>{rs(s.total_collected)}</span>
                    </div>
                </Section>

                <Section title="Cancelled orders" sectionKey="cancelled" ticked={ticked} onTick={tick}>
                    <Table head={["Type", "Orders", "Amount"]} rows={s.cancelled.map((c) => [c.label, c.orders, rs(c.amount)])} />
                </Section>
            </div>

            {/* history */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-bold text-slate-700 mb-3">Close history</h3>
                {!history ? <Spinner /> : (
                    <>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                                    <th className="py-2 font-semibold">Business date</th>
                                    <th className="py-2 font-semibold text-right">Total sales</th>
                                    <th className="py-2 font-semibold">Closed by</th>
                                    <th className="py-2 font-semibold">Closed at</th>
                                    <th className="py-2 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.data.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-300">No days closed yet</td></tr>}
                                {history.data.map((h) => (
                                    <tr key={h.id} onClick={() => setDate(h.business_date)}
                                        className={"border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 " + (h.business_date === date ? "bg-brand-50/50" : "")}>
                                        <td className="py-2 font-semibold text-slate-700">{h.business_date}</td>
                                        <td className="py-2 text-right">{rs(h.total_sales)}</td>
                                        <td className="py-2">{h.closed_by?.name ?? "—"}</td>
                                        <td className="py-2">{formatDateTime(h.closed_at)}</td>
                                        <td className="py-2">{h.status === "closed" ? "✅ Closed" : "🔓 Reopened"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Pagination data={history} onPage={loadHistory} />
                    </>
                )}
            </div>

            {/* close / reopen dialogs */}
            {modal === "close" && (
                <Modal title={`Close ${date}?`} onClose={() => setModal(null)}
                    footer={<>
                        <Btn onClick={() => setModal(null)} className="border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</Btn>
                        <Btn onClick={closeDay} disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50">
                            {saving ? "Closing…" : "Confirm close"}
                        </Btn>
                    </>}>
                    <p className="text-sm text-slate-500 mb-4">
                        Total collected: <b className="text-slate-800">{rs(s.total_collected)}</b> (sales {rs(s.total_sales)} + delivery charges {rs(s.delivery_charges)}).
                        Orders of this day will be locked until it is reopened.
                    </p>
                    <div className="space-y-3">
                        <Field label="Cash counted">
                            <input type="number" min="0" step="0.01" className={inputCls} value={form.cash_counted}
                                onChange={(e) => setForm({ ...form, cash_counted: e.target.value })} placeholder="Optional" />
                        </Field>
                        <Field label="Notes">
                            <textarea rows={3} className={inputCls} value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
                        </Field>
                    </div>
                </Modal>
            )}
            {modal === "reopen" && (
                <Modal title={`Reopen ${date}?`} onClose={() => setModal(null)}
                    footer={<>
                        <Btn onClick={() => setModal(null)} className="border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</Btn>
                        <Btn onClick={reopenDay} disabled={saving || !form.reason.trim()} className="bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">
                            {saving ? "Reopening…" : "Reopen"}
                        </Btn>
                    </>}>
                    <p className="text-sm text-slate-500 mb-4">Reopening unlocks this day's orders for changes. The day must be closed again afterwards.</p>
                    <Field label="Reason" required>
                        <textarea rows={3} className={inputCls} value={form.reason} autoFocus
                            onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                    </Field>
                </Modal>
            )}
        </div>
    );
}
