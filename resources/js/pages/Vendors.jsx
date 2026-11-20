import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { CrudForm, CrudPage, STATUS_FILTER } from "../Crud";
import DateRangeFilter, { fmtDate, rangeLabel } from "../DateRangeFilter";
import { useDialog } from "../Dialog";
import { ActionMenu, Btn, DatePicker, Field, Ico, Modal, Pagination, Select, Spinner, StatusText, TableBody, inputCls, useLoading } from "../ui";
import { localToday } from "../utils";

const MODULE = "vendors";

/* keep in sync with VendorTransaction::PAYMENT_METHODS */
const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "bank", label: "Bank" },
    { value: "other", label: "Other" },
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

const rs = (v) => `Rs. ${Math.abs(Number(v ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const money = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const errorMessage = (err, fallback) =>
    Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message ?? fallback;

/** positive = we owe the vendor (red), negative = paid in advance (green "Advance") */
const balanceText = (v) => (Number(v) < 0 ? `${rs(v)} Advance` : rs(v));
export function Balance({ value, className = "" }) {
    const v = Number(value ?? 0);
    const tone = v > 0 ? "text-red-600" : v < 0 ? "text-emerald-600" : "text-slate-500";
    return <span className={"font-semibold whitespace-nowrap " + tone + " " + className}>{balanceText(v)}</span>;
}

/* ================= 80mm receipt of one purchase / payment (same style as the order invoice) ================= */
const receiptNo = (t) => `${t.type === "payment" ? "PAY" : "PUR"}-${String(t.id).padStart(5, "0")}`;

export async function printVendorReceipt(id, dialog) {
    let d;
    try {
        d = (await api.get(`/admin/vendor-transactions/${id}/receipt`)).data;
    } catch (err) {
        dialog?.alert(errorMessage(err, "The receipt could not be printed."), { title: "Couldn't print", variant: "danger" });
        return;
    }
    const t = d.transaction;
    const v = d.vendor;
    const isPayment = t.type === "payment";
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value, cls = "summary-row") => `<div class="${cls}"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(receiptNo(t))}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #000; background: #fff;
        width: 280px; max-width: 280px; margin: 0 auto; padding: 8px 6px; line-height: 1.35; }
    .center { text-align: center; }
    .title { font-size: 15px; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
    .meta { font-size: 12px; margin-bottom: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .summary-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; font-size: 13px; }
    .amt { white-space: nowrap; }
    .total-row { display: flex; justify-content: space-between; margin: 6px 0; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 15px; font-weight: 700; }
    .comment { font-size: 12px; white-space: pre-wrap; word-break: break-word; }
    .sign { margin-top: 28px; display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }
    .sign span { flex: 1; border-top: 1px solid #000; padding-top: 3px; text-align: center; }
    .footer { text-align: center; font-size: 11px; margin-top: 12px; color: #333; }
    @page { size: 80mm auto; margin: 2mm; }
    @media print { body { width: 72mm; max-width: 72mm; padding: 2mm; } }
</style>
</head>
<body>
<div class="center">
    <div class="title">${esc(d.restaurant)}</div>
    <div style="font-weight:700;">${isPayment ? "PAYMENT RECEIPT" : "PURCHASE RECEIPT"}</div>
    <div style="font-size:12px;margin-bottom:8px;">${esc(receiptNo(t))}</div>
</div>
<div class="meta">
    ${line("Date", fmtDate(t.transaction_date))}
    ${line("Vendor", v.name)}
    ${line("Company", v.company)}
    ${line("Phone", v.phone)}
</div>
<hr/>
<div class="meta">
    ${line(isPayment ? "Receipt / Cheque No" : "Bill / Invoice No", t.reference)}
    ${isPayment ? line("Payment Method", METHOD_LABEL[t.payment_method] ?? t.payment_method) : ""}
    ${t.source === "chai" ? line("Source", "Chai") : ""}
</div>
<div class="total-row"><span>${isPayment ? "AMOUNT PAID" : "PURCHASE AMOUNT"}</span><span class="amt">Rs. ${money(t.amount)}</span></div>
${t.comment ? `<div class="comment"><b>Comment:</b> ${esc(t.comment)}</div>` : ""}
<hr/>
${row("Balance before", balanceText(d.balance_before))}
${row(isPayment ? "Paid" : "Purchased", `${isPayment ? "-" : "+"} Rs. ${money(t.amount)}`)}
${row("Balance after", balanceText(d.balance_after), "total-row")}
${d.current_balance !== d.balance_after ? row("Current balance", balanceText(d.current_balance)) : ""}
<div class="sign"><span>${isPayment ? "Received by" : "Delivered by"}</span><span>Authorized by</span></div>
<div class="footer">
    ${t.created_by ? `Entered by ${esc(t.created_by)}<br>` : ""}
    Printed ${esc(new Date().toLocaleString("en-GB"))}
</div>
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

/* ================= add / edit purchase or payment ================= */
function TransactionModal({ vendor, type, tx, onClose, onSaved }) {
    const dialog = useDialog();
    const isPayment = type === "payment";
    const [form, setForm] = useState(() => ({
        transaction_date: tx?.date ?? localToday(),
        amount: tx ? String(isPayment ? tx.debit : tx.credit) : "",
        reference: tx?.reference ?? "",
        payment_method: tx?.payment_method ?? "cash",
        comment: tx?.comment ?? "",
    }));
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    /** Save just saves; Print saves first, then prints the saved entry's receipt */
    const save = async ({ print = false } = {}) => {
        const e = {};
        if (!form.transaction_date) e.transaction_date = "Choose a date.";
        if (!(Number(form.amount) > 0)) e.amount = "Enter an amount greater than 0.";
        setErrors(e);
        if (Object.keys(e).length) return;

        setSaving(print ? "print" : "save");
        const payload = {
            type, transaction_date: form.transaction_date, amount: Number(form.amount),
            reference: form.reference || null, comment: form.comment || null,
            ...(isPayment ? { payment_method: form.payment_method || null } : {}),
        };
        try {
            const r = tx
                ? await api.post(`/admin/vendor-transactions/${tx.id}`, payload)
                : await api.post(`/admin/vendors/${vendor.id}/transactions`, payload);
            onSaved();
            if (print) printVendorReceipt(r.data.id, dialog);
        } catch (err) {
            if (err.response?.status === 422 && err.response.data.errors) {
                const fieldErrors = Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, v[0]]));
                setErrors(fieldErrors);
                // errors that don't belong to a form field (inactive vendor, chai entry)
                if (fieldErrors.vendor || fieldErrors.source) {
                    dialog.alert(fieldErrors.vendor ?? fieldErrors.source, { title: "Couldn't save", variant: "warning" });
                }
            } else {
                dialog.alert(errorMessage(err, "The entry could not be saved. Try again."), { title: "Couldn't save", variant: "danger" });
            }
        } finally { setSaving(false); }
    };

    const err = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

    return (
        <Modal title={`${tx ? "Edit" : "Add"} ${isPayment ? "payment" : "purchase"} · ${vendor.name}`} onClose={onClose}
            footer={<>
                <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
                <Btn onClick={() => save({ print: true })} disabled={!!saving} title="Save the entry and print its receipt"
                    className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <Ico n="print" /> {saving === "print" ? "Saving…" : "Save & Print"}
                </Btn>
                <Btn onClick={() => save()} disabled={!!saving} className="bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                    {saving === "save" ? "Saving…" : "Save"}
                </Btn>
            </>}>
            <p className="text-xs text-slate-500 mb-4">
                {isPayment
                    ? "Money paid to the vendor. Lowers what we owe (debit). Not counted in Profit & Loss."
                    : "Stock received on credit. Raises what we owe (credit) and counts as a purchase in Profit & Loss."}
            </p>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Date" required>
                        <DatePicker value={form.transaction_date} max={localToday()}
                            onChange={(v) => set("transaction_date", v)} />
                        {err("transaction_date")}
                    </Field>
                    <Field label="Amount" required>
                        <input type="number" min="0.01" step="0.01" value={form.amount} autoFocus
                            onChange={(e) => set("amount", e.target.value)} className={inputCls} />
                        {err("amount")}
                    </Field>
                </div>
                <div className={isPayment ? "grid grid-cols-2 gap-4" : ""}>
                    <Field label={isPayment ? "Receipt / cheque no." : "Bill / invoice no."}>
                        <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={inputCls} />
                        {err("reference")}
                    </Field>
                    {isPayment && (
                        <Field label="Payment method">
                            <Select value={form.payment_method} onChange={(v) => set("payment_method", v)} options={PAYMENT_METHODS}
                                searchable={false} clearable={false} />
                            {err("payment_method")}
                        </Field>
                    )}
                </div>
                <Field label="Comment">
                    <textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} className={inputCls} />
                    {err("comment")}
                </Field>
            </div>
        </Modal>
    );
}

/* ================= vendor list ================= */
/* keep in sync with Vendor::BALANCE_FILTERS (?balance=) */
const BALANCE_FILTER = {
    param: "balance",
    options: [{ value: "owed", label: "Balance" }, { value: "advance", label: "Advance" }],
};

const columns = [
    // name + company share a cell (stacked); amounts never wrap, so every value fits on one line
    {
        key: "name", label: "Name / Company",
        render: (r) => (
            <div>
                <p className="font-semibold text-slate-800">{r.name}</p>
                {r.company && <p className="text-xs text-slate-400">{r.company}</p>}
            </div>
        ),
    },
    { key: "phone", label: "Phone" },
    { key: "total_purchases", label: "Total Purchases", render: (r) => <span className="whitespace-nowrap">{rs(r.total_purchases)}</span> },
    { key: "total_payments", label: "Total Payments", render: (r) => <span className="whitespace-nowrap">{rs(r.total_payments)}</span> },
    { key: "balance", label: "Balance", filter: BALANCE_FILTER, render: (r) => <Balance value={r.balance} /> },
    { key: "status", label: "Status", filter: STATUS_FILTER, render: (r) => <StatusText on={r.status} /> },
];

const fields = [
    { name: "name", label: "Name", required: true },
    { name: "phone", label: "Phone" },
    { name: "company", label: "Company" },
    { name: "address", label: "Address" },
    { name: "opening_balance", label: "Opening balance (what we already owed; negative = advance)", type: "number", default: 0 },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "status", label: "Active", type: "checkbox", default: true },
];

function VendorList() {
    const { can } = useAuth();
    const [modal, setModal] = useState(null); // { vendor, type, reload }

    const summary = (data) => data?.totals && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {[
                ["Total balance", <span className="text-red-600">{rs(data.totals.total_owed)}</span>, "!border-t-red-500"],
                ["Advance paid to vendors", <span className="text-emerald-600">{rs(data.totals.total_advance)}</span>, "!border-t-emerald-500"],
            ].map(([label, val, accent]) => (
                <div key={label} className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + accent}>
                    <p className="text-xs text-slate-400 font-medium">{label}</p>
                    <p className="text-xl font-extrabold text-slate-800 mt-1">{val}</p>
                </div>
            ))}
        </div>
    );

    // ledger / purchase / payment live in one "⋯" menu so the actions column stays narrow
    const extraActions = (row, reload) => {
        const canAdd = can(MODULE, "create") && row.status;
        return (
            <ActionMenu items={[
                { label: "Ledger", icon: "book", to: `${row.id}/ledger` },
                canAdd && { label: "Add purchase", icon: "cart", className: "text-amber-700",
                    onClick: () => setModal({ vendor: row, type: "purchase", reload }) },
                canAdd && { label: "Add payment", icon: "cash", className: "text-emerald-700",
                    onClick: () => setModal({ vendor: row, type: "payment", reload }) },
            ]} />
        );
    };

    return (
        <>
            <CrudPage title="Vendors" endpoint="admin/vendors" columns={columns} canImport={false}
                searchPlaceholder="Search name / phone / company…" summary={summary} extraActions={extraActions} />
            {modal && <TransactionModal vendor={modal.vendor} type={modal.type} onClose={() => setModal(null)}
                onSaved={() => { modal.reload(); setModal(null); }} />}
        </>
    );
}

export default function Vendors() {
    const form = <CrudForm title="Vendor" endpoint="admin/vendors" fields={fields} backTo="/vendors" />;
    return (
        <Routes>
            <Route index element={<VendorList />} />
            <Route path="create" element={form} />
            <Route path=":id" element={form} />
            <Route path=":id/edit" element={form} />
        </Routes>
    );
}

/* ================= A4 ledger print (all rows of the range, oldest first) ================= */
function printLedger(d) {
    const rows = d.rows.data;   // already oldest first
    const num = (v) => (Number(v) ? money(v) : "");
    const head = ["Date", "Type", "Reference", "Comment", "Debit", "Credit", "Balance"];
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Ledger - ${esc(d.vendor.name)}</title>
<style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .muted { color: #555; }
    .meta { display: flex; justify-content: space-between; margin: 10px 0 12px; gap: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; }
    th { background: #f1f3f6; text-align: left; font-size: 10px; text-transform: uppercase; }
    td.n, th.n { text-align: right; white-space: nowrap; }
    tr.strong td { font-weight: bold; background: #f7f8fa; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .footer { margin-top: 10px; font-size: 10px; color: #777; }
</style>
</head>
<body>
<h1>Vendor Ledger</h1>
<div class="meta">
    <div>
        <div style="font-size:14px;font-weight:bold;">${esc(d.vendor.name)}</div>
        ${d.vendor.company ? `<div>${esc(d.vendor.company)}</div>` : ""}
        ${d.vendor.phone ? `<div class="muted">${esc(d.vendor.phone)}</div>` : ""}
    </div>
    <div style="text-align:right;">
        <div><b>Period:</b> ${esc(rangeLabel(d.range))}</div>
        ${d.search ? `<div><b>Search:</b> "${esc(d.search)}"</div>` : ""}
        <div><b>Current balance:</b> ${esc(balanceText(d.vendor.balance))}</div>
    </div>
</div>
<table>
    <thead><tr>${head.map((h, i) => `<th class="${i >= 4 ? "n" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>
        <tr class="strong"><td colspan="6">Opening balance${d.range.from ? ` (b/f to ${esc(fmtDate(d.range.from))})` : ""}</td>
            <td class="n">${esc(balanceText(d.opening_balance_for_range))}</td></tr>
        ${rows.map((r) => `<tr>
            <td>${esc(fmtDate(r.date))}</td>
            <td>${r.type === "payment" ? "Payment" : "Purchase"}${r.payment_method ? ` (${esc(METHOD_LABEL[r.payment_method] ?? r.payment_method)})` : ""}${r.source === "chai" ? " · Chai" : ""}</td>
            <td>${esc(r.reference)}</td>
            <td>${esc(r.comment)}</td>
            <td class="n">${num(r.debit)}</td>
            <td class="n">${num(r.credit)}</td>
            <td class="n">${esc(balanceText(r.running_balance))}</td>
        </tr>`).join("")}
        ${rows.length === 0 ? `<tr><td colspan="7" class="muted" style="text-align:center;padding:12px;">No entries in this period</td></tr>` : ""}
        ${d.matched_totals ? `<tr class="strong"><td colspan="4">Matching entries (${d.matched_totals.count})</td>
            <td class="n">${money(d.matched_totals.debit)}</td><td class="n">${money(d.matched_totals.credit)}</td><td></td></tr>` : ""}
        <tr class="strong"><td colspan="4">Period totals (${d.totals.count} entries)</td>
            <td class="n">${money(d.totals.debit)}</td><td class="n">${money(d.totals.credit)}</td><td></td></tr>
        <tr class="strong"><td colspan="6">Closing balance</td><td class="n">${esc(balanceText(d.totals.closing_balance))}</td></tr>
    </tbody>
</table>
<div class="footer">Debit = payment to the vendor, Credit = purchase from the vendor. Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
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

/* ================= 80mm short ledger receipt (same range / search as the A4 print) ================= */
function printShortLedger(d) {
    const rows = d.rows.data;   // already oldest first
    const short = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const ddmm = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "");
    const count = (type) => (d.search ? "" : ` (${rows.filter((r) => r.type === type).length})`);
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value) => `<div class="summary-row"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Ledger - ${esc(d.vendor.name)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #000; background: #fff;
        width: 280px; max-width: 280px; margin: 0 auto; padding: 8px 6px; line-height: 1.35; }
    .center { text-align: center; }
    .title { font-size: 15px; font-weight: 700; letter-spacing: 1px; margin-bottom: 2px; }
    .meta { font-size: 12px; margin-bottom: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 2px 0; text-align: left; vertical-align: top; }
    th { border-bottom: 1px solid #000; }
    .n { text-align: right; white-space: nowrap; }
    .b { font-weight: 700; }
    .summary-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; font-size: 13px; }
    .amt { white-space: nowrap; }
    .total-row { display: flex; justify-content: space-between; margin: 6px 0; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 15px; font-weight: 700; }
    .footer { text-align: center; font-size: 11px; margin-top: 12px; color: #333; }
    @page { size: 80mm auto; margin: 2mm; }
    @media print { body { width: 72mm; max-width: 72mm; padding: 2mm; } }
</style>
</head>
<body>
<div class="center">
    <div class="title">${esc(d.restaurant)}</div>
    <div style="font-weight:700;margin-bottom:8px;">VENDOR LEDGER</div>
</div>
<div class="meta">
    ${line("Vendor", d.vendor.name)}
    ${line("Phone", d.vendor.phone)}
    ${line("Period", rangeLabel(d.range))}
    ${d.search ? line("Search", `"${d.search}"`) : ""}
</div>
<hr/>
<table>
    <thead><tr><th>Date</th><th>Type</th><th class="n">Amount</th><th class="n">Balance</th></tr></thead>
    <tbody>
        <tr><td colspan="3">Opening b/f</td><td class="n b">${short(d.opening_balance_for_range)}</td></tr>
        ${rows.map((r) => `<tr>
            <td>${ddmm(r.date)}</td>
            <td>${r.type === "payment" ? "PAY" : "PUR"}</td>
            <td class="n">${r.type === "payment" ? `-${short(r.debit)}` : `+${short(r.credit)}`}</td>
            <td class="n">${short(r.running_balance)}</td>
        </tr>`).join("")}
        ${rows.length === 0 ? `<tr><td colspan="4" class="center" style="padding:6px 0;">No entries in this period</td></tr>` : ""}
    </tbody>
</table>
<hr/>
${row("Opening Balance", money(d.opening_balance_for_range))}
${row(`Purchases${count("purchase")}`, money(d.totals.credit))}
${row(`Payments${count("payment")}`, money(d.totals.debit))}
<div class="total-row"><span>CLOSING BALANCE</span><span class="amt">${esc(balanceText(d.totals.closing_balance))}</span></div>
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

/* ================= vendor ledger page (/vendors/:id/ledger) ================= */
export function VendorLedger() {
    const { id } = useParams();
    const nav = useNavigate();
    const { can } = useAuth();
    const dialog = useDialog();
    const [params, setParams] = useSearchParams();
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [loading, track] = useLoading();
    const [modal, setModal] = useState(null); // { type, tx? }
    const [printing, setPrinting] = useState(false);

    // filters live in the URL so refresh / back keep them
    const range = params.get("range") ?? "all";
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    const q = params.get("q") ?? "";
    const page = Number(params.get("page") ?? 1);
    const [search, setSearch] = useState(q);

    /** update some query keys; any filter change goes back to page 1 */
    const update = (changes, { keepPage = false } = {}) => {
        const next = new URLSearchParams(params);
        Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
        if (!keepPage) next.delete("page");
        setParams(next, { replace: true });
    };

    const query = () => ({
        range, search: q || undefined,
        ...(range === "custom" ? { from: from || undefined, to: to || undefined } : {}),
    });

    const load = () => track(api.get(`/admin/vendors/${id}/ledger`, { params: { ...query(), page } })
        .then((r) => { setD(r.data); setError(""); })
        .catch((err) => {
            if (err.response?.status === 404) return nav("/vendors", { replace: true });
            setError(errorMessage(err, "The ledger could not be loaded."));
        }));

    useEffect(() => { load(); }, [id, params.toString()]); // eslint-disable-line

    // back / forward can change ?q= under us
    useEffect(() => { setSearch(q); }, [q]);

    // debounced search, like the list pages
    const firstSearch = useRef(true);
    useEffect(() => {
        if (firstSearch.current) { firstSearch.current = false; return; }
        const t = setTimeout(() => { if (search !== q) update({ q: search.trim() }); }, 300);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line

    // printing = which print is loading ("ledger" | "short"); both use every row of the current filters
    const print = async (kind = "ledger") => {
        setPrinting(kind);
        try {
            const r = await api.get(`/admin/vendors/${id}/ledger`, { params: { ...query(), all: 1 } });
            (kind === "short" ? printShortLedger : printLedger)(r.data);
        } catch (err) {
            dialog.alert(errorMessage(err, "The ledger could not be printed."), { title: "Couldn't print", variant: "danger" });
        } finally { setPrinting(false); }
    };

    const remove = async (row) => {
        const what = row.type === "payment" ? "payment" : "purchase";
        if (!(await dialog.confirm(`This ${what} of ${rs(row.debit || row.credit)} on ${fmtDate(row.date)} will be permanently deleted. This can't be undone.`,
            { title: `Delete this ${what}?`, okText: "Delete" }))) return;
        try {
            await api.delete(`/admin/vendor-transactions/${row.id}`);
            load();
        } catch (err) {
            dialog.alert(errorMessage(err, "The entry could not be deleted."), { title: "Can't delete", variant: "warning" });
        }
    };

    if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;

    const v = d.vendor;
    const rows = d.rows.data;
    const canAdd = can(MODULE, "create") && v.status;
    const canEdit = can(MODULE, "edit");
    const canDelete = can(MODULE, "delete");
    const num = (val) => (Number(val) ? money(val) : "");

    return (
        <div className="space-y-5">
            {/* header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link to="/vendors" className="text-xs font-semibold text-slate-400 hover:text-slate-600">← Vendors</Link>
                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                        {v.name}
                        {!v.status && <span className="text-xs bg-slate-100 px-2 py-1 rounded-full"><StatusText on={false} /></span>}
                    </h2>
                    <p className="text-sm text-slate-500">{[v.company, v.phone].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2 text-right mr-2">
                        <p className="text-xs text-slate-400 font-medium">Current balance</p>
                        <Balance value={v.balance} className="text-lg font-extrabold" />
                    </div>
                    <Btn onClick={() => print("short")} disabled={!!printing} title="Print a short 80mm receipt of this ledger"
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">🖨️ {printing === "short" ? "Preparing…" : "Print Short Receipt"}</Btn>
                    <Btn onClick={() => print("ledger")} disabled={!!printing}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">🖨️ {printing === "ledger" ? "Preparing…" : "Print Ledger"}</Btn>
                    {can(MODULE, "create") && (
                        <>
                            <Btn onClick={() => setModal({ type: "purchase" })} disabled={!canAdd} title={!v.status ? "This vendor is disabled" : undefined}
                                className="bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"><Ico n="plus" /> Add purchase</Btn>
                            <Btn onClick={() => setModal({ type: "payment" })} disabled={!canAdd} title={!v.status ? "This vendor is disabled" : undefined}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"><Ico n="plus" /> Add payment</Btn>
                        </>
                    )}
                </div>
            </div>

            {/* filters */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-2">
                <DateRangeFilter range={range} from={from} to={to} resolved={d.range} onChange={(changes) => update(changes)} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search comment / reference…"
                    className={inputCls + " !w-64 ml-auto"} />
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            {/* ledger */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 font-semibold">Date</th>
                            <th className="p-3 font-semibold">Type</th>
                            <th className="p-3 font-semibold">Reference</th>
                            <th className="p-3 font-semibold">Comment</th>
                            <th className="p-3 font-semibold text-right">Debit</th>
                            <th className="p-3 font-semibold text-right">Credit</th>
                            <th className="p-3 font-semibold text-right">Balance</th>
                            <th className="p-3 w-20" />
                        </tr>
                    </thead>
                    <TableBody loading={loading} cols={8}>
                        <tr className="border-b border-slate-200 bg-slate-50/60 font-semibold text-slate-700">
                            <td className="p-3" colSpan={6}>
                                Opening balance <span className="font-normal text-slate-400">
                                    {d.range.from ? `(brought forward to ${fmtDate(d.range.from)})` : "(from the start)"}
                                </span>
                            </td>
                            <td className="p-3 text-right"><Balance value={d.opening_balance_for_range} /></td>
                            <td />
                        </tr>
                        {rows.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                                <td className="p-3 whitespace-nowrap text-slate-700">{fmtDate(r.date)}</td>
                                <td className="p-3 whitespace-nowrap">
                                    <span className={"text-xs font-bold px-2 py-1 rounded-full " +
                                        (r.type === "payment" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                                        {r.type === "payment" ? "Payment" : "Purchase"}
                                    </span>
                                    {r.payment_method && <span className="text-xs text-slate-400 ml-1.5">{METHOD_LABEL[r.payment_method] ?? r.payment_method}</span>}
                                </td>
                                <td className="p-3 text-slate-600">{r.reference || "—"}</td>
                                <td className="p-3 text-slate-600 max-w-xs break-words">{r.comment || "—"}</td>
                                <td className="p-3 text-right whitespace-nowrap">{num(r.debit)}</td>
                                <td className="p-3 text-right whitespace-nowrap">{num(r.credit)}</td>
                                <td className="p-3 text-right"><Balance value={r.running_balance} /></td>
                                <td className="p-3">
                                    <div className="flex justify-end items-center gap-1.5">
                                        {/* every entry can be (re)printed; chai entries can't be edited or deleted here */}
                                        <button onClick={() => printVendorReceipt(r.id, dialog)} title="Print receipt"
                                            className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="print" /></button>
                                        {r.source === "chai" ? (
                                            <span title="Managed from the Chai module" className="text-xs font-bold bg-sky-50 text-sky-700 px-2 py-1 rounded-full">Chai</span>
                                        ) : (
                                            <>
                                                {canEdit && <button onClick={() => setModal({ type: r.type, tx: r })} title="Edit"
                                                    className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 flex items-center justify-center"><Ico n="edit" /></button>}
                                                {canDelete && <button onClick={() => remove(r)} title="Delete"
                                                    className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center"><Ico n="trash" /></button>}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr><td colSpan={8} className="p-10 text-center text-slate-300">{q ? "No entries match your search" : "No entries in this period"}</td></tr>
                        )}
                    </TableBody>
                    <tfoot className={loading ? "hidden" : ""}>
                        {d.matched_totals && (
                            <tr className="border-t border-slate-200 text-slate-600">
                                <td className="p-3" colSpan={4}>Matching “{d.search}” ({d.matched_totals.count} entries)</td>
                                <td className="p-3 text-right">{money(d.matched_totals.debit)}</td>
                                <td className="p-3 text-right">{money(d.matched_totals.credit)}</td>
                                <td colSpan={2} />
                            </tr>
                        )}
                        <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
                            <td className="p-3" colSpan={4}>Period totals ({d.totals.count} entries)</td>
                            <td className="p-3 text-right">{money(d.totals.debit)}</td>
                            <td className="p-3 text-right">{money(d.totals.credit)}</td>
                            <td colSpan={2} />
                        </tr>
                        <tr className="font-bold text-slate-800 bg-slate-50/60">
                            <td className="p-3" colSpan={6}>Closing balance</td>
                            <td className="p-3 text-right"><Balance value={d.totals.closing_balance} /></td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>

            <Pagination data={d.rows} onPage={(p) => update({ page: String(p) }, { keepPage: true })} />

            {modal && <TransactionModal vendor={v} type={modal.type} tx={modal.tx} onClose={() => setModal(null)}
                onSaved={() => { setModal(null); load(); }} />}
        </div>
    );
}
