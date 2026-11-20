import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../auth";
import DateRangeFilter, { fmtDate, rangeLabel } from "../DateRangeFilter";
import { useDialog } from "../Dialog";
import { Btn, DatePicker, Field, Ico, Modal, Pagination, Select, Spinner, TableBody, inputCls, useLoading } from "../ui";
import { escapeHtml as esc, localToday, printHtml } from "../utils";

/* Extra expenses of the restaurant (permission module: expenses). Subtracted in Profit & Loss. */
const MODULE = "expenses";

/* keep in sync with Expense::PAYMENT_METHODS */
const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "bank", label: "Bank" },
    { value: "other", label: "Other" },
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

const rs = (v) => `Rs. ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const money = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorMessage = (err, fallback) =>
    Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message ?? fallback;
const iconBtn = "w-8 h-8 rounded-lg flex items-center justify-center ";

/** the page filters as API query params (the DateRangeFilter "range" is sent as "preset") */
const toParams = (f) => ({
    preset: f.range,
    from: f.range === "custom" ? f.from || undefined : undefined,
    to: f.range === "custom" ? f.to || undefined : undefined,
    category_id: f.category_id || undefined,
    search: f.search || undefined,
});

/* ================= A4 report print (same look as the vendor ledger print) ================= */
function printReport(d, categoryName, search) {
    const head = ["Date", "Category", "Paid to", "Reference", "Description", "Method", "Amount"];
    printHtml(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Expense Report</title>
<style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    h2 { font-size: 13px; margin: 14px 0 6px; }
    .muted { color: #555; }
    .meta { display: flex; justify-content: space-between; margin: 10px 0 12px; gap: 16px; }
    .warn { border: 1px solid #d97706; background: #fffbeb; padding: 6px 8px; margin-bottom: 10px; }
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
<h1>Expense Report</h1>
<div class="meta">
    <div style="font-size:14px;font-weight:bold;">${esc(d.restaurant)}</div>
    <div style="text-align:right;">
        <div><b>Period:</b> ${esc(rangeLabel(d.range))}</div>
        ${categoryName ? `<div><b>Category:</b> ${esc(categoryName)}</div>` : ""}
        ${search ? `<div><b>Search:</b> "${esc(search)}"</div>` : ""}
        <div><b>Total expenses:</b> Rs. ${money(d.totals.total)}</div>
    </div>
</div>
${d.capped ? `<div class="warn">Only the newest ${d.limit.toLocaleString()} of ${d.totals.count.toLocaleString()} entries are listed. The totals cover all entries.</div>` : ""}

<h2>By category</h2>
<table>
    <thead><tr><th>Category</th><th class="n">Entries</th><th class="n">Amount</th><th class="n">%</th></tr></thead>
    <tbody>
        ${d.categories.map((c) => `<tr><td>${esc(c.name)}</td><td class="n">${c.count}</td><td class="n">${money(c.total)}</td><td class="n">${c.percent}%</td></tr>`).join("")}
        <tr class="strong"><td>Total</td><td class="n">${d.totals.count}</td><td class="n">${money(d.totals.total)}</td><td class="n">${d.totals.count ? "100%" : ""}</td></tr>
    </tbody>
</table>

<h2>Entries</h2>
<table>
    <thead><tr>${head.map((h, i) => `<th class="${i === 6 ? "n" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>
        ${d.rows.map((r) => `<tr>
            <td style="white-space:nowrap;">${esc(fmtDate(r.expense_date))}</td>
            <td>${esc(r.category?.name)}</td>
            <td>${esc(r.paid_to)}</td>
            <td>${esc(r.reference)}</td>
            <td>${esc(r.comment)}</td>
            <td>${esc(METHOD_LABEL[r.payment_method] ?? r.payment_method)}</td>
            <td class="n">${money(r.amount)}</td>
        </tr>`).join("")}
        ${d.rows.length === 0 ? `<tr><td colspan="7" class="muted" style="text-align:center;padding:12px;">No expenses in this period</td></tr>` : ""}
        <tr class="strong"><td colspan="6">Grand total (${d.totals.count} entries)</td><td class="n">${money(d.totals.total)}</td></tr>
    </tbody>
</table>
<div class="footer">Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`);
}

/* ================= 80mm short receipt for thermal printers (same filters as the A4 print, like the vendor short ledger) ================= */
function printShortReport(d, categoryName, search) {
    const short = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const ddmm = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "");
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value) => `<div class="summary-row"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;

    printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Expenses</title>
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
    <div style="font-weight:700;margin-bottom:8px;">EXPENSES</div>
</div>
<div class="meta">
    ${line("Period", rangeLabel(d.range))}
    ${line("Category", categoryName)}
    ${search ? line("Search", `"${search}"`) : ""}
</div>
${d.capped ? `<div class="meta">Only the newest ${d.limit} entries are listed. Totals cover all entries.</div>` : ""}
<hr/>
<table>
    <thead><tr><th>Date</th><th>Category</th><th class="n">Amount</th></tr></thead>
    <tbody>
        ${d.rows.map((r) => `<tr><td>${ddmm(r.expense_date)}</td><td>${esc(r.category?.name)}</td><td class="n">${short(r.amount)}</td></tr>`).join("")}
        ${d.rows.length === 0 ? `<tr><td colspan="3" class="center" style="padding:6px 0;">No expenses in this period</td></tr>` : ""}
    </tbody>
</table>
<hr/>
${d.categories.map((c) => row(`${c.name} (${c.count})`, money(c.total))).join("")}
<div class="total-row"><span>TOTAL (${d.totals.count})</span><span class="amt">Rs. ${money(d.totals.total)}</span></div>
<div class="footer">Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`);
}

/* ================= add / edit expense ================= */
function ExpenseModal({ expense, categories, onClose, onSaved }) {
    const dialog = useDialog();
    const [form, setForm] = useState({
        expense_date: expense?.expense_date ?? localToday(),
        expense_category_id: expense?.expense_category_id ?? "",
        amount: expense ? String(expense.amount) : "",
        payment_method: expense?.payment_method ?? "cash",
        paid_to: expense?.paid_to ?? "",
        reference: expense?.reference ?? "",
        comment: expense?.comment ?? "",
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // inactive categories can't take new entries, but an entry being edited keeps showing its own
    const options = categories
        .filter((c) => c.status || c.id === expense?.expense_category_id)
        .map((c) => ({ value: c.id, label: c.status ? c.name : `${c.name} (inactive)` }));

    const save = async () => {
        setSaving(true);
        setErrors({});
        const payload = {
            ...form, amount: Number(form.amount),
            paid_to: form.paid_to || null, reference: form.reference || null, comment: form.comment || null,
        };
        try {
            if (expense) await api.post(`/admin/expenses/${expense.id}`, payload);
            else await api.post("/admin/expenses", payload);
            onSaved();
        } catch (err) {
            if (err.response?.status === 422 && err.response.data.errors) {
                setErrors(Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, v[0]])));
            } else {
                dialog.alert(errorMessage(err, "Could not save. Try again."), { title: "Couldn't save", variant: "danger" });
            }
        } finally { setSaving(false); }
    };

    const err = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

    return (
        <Modal title={expense ? "Edit expense" : "Add expense"} onClose={onClose}
            footer={<>
                <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
                <Btn onClick={save} disabled={saving} className="bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                    {saving ? "Saving…" : "Save"}
                </Btn>
            </>}>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Date" required>
                        <DatePicker value={form.expense_date} max={localToday()} onChange={(v) => set("expense_date", v)} />
                        {err("expense_date")}
                    </Field>
                    <Field label="Amount" required>
                        <input type="number" min="0.01" step="0.01" value={form.amount} autoFocus
                            onChange={(e) => set("amount", e.target.value)} className={inputCls} />
                        {err("amount")}
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Category" required>
                        <Select value={form.expense_category_id} onChange={(v) => set("expense_category_id", v)} options={options}
                            placeholder="Select category" clearable={false} />
                        {err("expense_category_id")}
                    </Field>
                    <Field label="Payment method" required>
                        <Select value={form.payment_method} onChange={(v) => set("payment_method", v)} options={PAYMENT_METHODS}
                            searchable={false} clearable={false} />
                        {err("payment_method")}
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Paid to">
                        <input value={form.paid_to} onChange={(e) => set("paid_to", e.target.value)} className={inputCls} />
                        {err("paid_to")}
                    </Field>
                    <Field label="Reference (bill / receipt no.)">
                        <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={inputCls} />
                        {err("reference")}
                    </Field>
                </div>
                <Field label="Description">
                    <textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} className={inputCls} />
                    {err("comment")}
                </Field>
            </div>
        </Modal>
    );
}

/* ================= expenses page (/expenses) ================= */
export default function Expenses() {
    const { can } = useAuth();
    const dialog = useDialog();
    const [filters, setFilters] = useState({ range: "this_month", from: "", to: "", category_id: "", search: "", page: 1 });
    const [searchText, setSearchText] = useState("");
    const [categories, setCategories] = useState([]);
    const [list, setList] = useState(null);
    const [error, setError] = useState("");
    const [loading, track] = useLoading();
    const [modal, setModal] = useState(null);   // { expense } (expense is undefined when adding)
    const [printing, setPrinting] = useState(false);

    /** any filter change goes back to page 1 */
    const change = (changes) => setFilters((f) => ({ ...f, ...changes, page: 1 }));

    // the list response carries the totals of the whole filtered range, so the page needs no second request
    const load = () => track(api.get("/admin/expenses", { params: { ...toParams(filters), page: filters.page } })
        .then((r) => { setList(r.data); setError(""); })
        .catch((err) => setError(errorMessage(err, "The expenses could not be loaded."))));

    useEffect(() => { load(); }, [filters]); // eslint-disable-line

    useEffect(() => {
        api.get("/admin/expenses/categories").then((r) => setCategories(r.data)).catch(() => {});
    }, []);

    // debounced search, like the list pages
    useEffect(() => {
        const t = setTimeout(() => { if (searchText.trim() !== filters.search) change({ search: searchText.trim() }); }, 300);
        return () => clearTimeout(t);
    }, [searchText]); // eslint-disable-line

    const remove = async (e) => {
        if (!(await dialog.confirm(`The ${e.category?.name ?? ""} expense of ${rs(e.amount)} on ${fmtDate(e.expense_date)} will be permanently deleted. This can't be undone.`,
            { title: "Delete this expense?", okText: "Delete" }))) return;
        try {
            await api.delete(`/admin/expenses/${e.id}`);
            load();
        } catch (err) {
            dialog.alert(errorMessage(err, "The expense could not be deleted."), { title: "Can't delete", variant: "warning" });
        }
    };

    /** kind: "short" = 80mm thermal receipt, "report" = A4 */
    const print = async (kind) => {
        setPrinting(kind);
        try {
            const d = (await api.get("/admin/expenses/print", { params: toParams(filters) })).data;
            const categoryName = categories.find((c) => c.id === filters.category_id)?.name;
            (kind === "short" ? printShortReport : printReport)(d, categoryName, filters.search);
        } catch (err) {
            dialog.alert(errorMessage(err, "The report could not be printed."), { title: "Couldn't print", variant: "danger" });
        } finally { setPrinting(false); }
    };

    if (!list) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">Expenses</h2>
                    <p className="text-sm text-slate-500">Running costs of the restaurant. Subtracted in Profit & Loss.</p>
                </div>
                <div className="flex gap-2">
                    <Btn onClick={() => print("short")} disabled={!!printing} title="Print a short 80mm receipt for the thermal printer"
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        <Ico n="print" /> {printing === "short" ? "Preparing…" : "Print Short Receipt"}
                    </Btn>
                    <Btn onClick={() => print("report")} disabled={!!printing}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        <Ico n="print" /> {printing === "report" ? "Preparing…" : "Print Report"}
                    </Btn>
                    {can(MODULE, "create") && (
                        <Btn onClick={() => setModal({})} className="bg-brand-600 text-white hover:bg-brand-700"><Ico n="plus" /> Add expense</Btn>
                    )}
                </div>
            </div>

            {/* totals above the filters, like the Loans page */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 !border-t-red-500">
                    <p className="text-xs text-slate-400 font-medium">Total expenses</p>
                    <p className="text-xl font-extrabold text-slate-800 mt-1">{rs(list.totals.total)}</p>
                    <p className="text-xs text-slate-400 mt-1">{list.totals.count} entries · {rangeLabel(list.range)}</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <DateRangeFilter range={filters.range} from={filters.from} to={filters.to} resolved={list.range} onChange={change} />
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <Select value={filters.category_id} onChange={(v) => change({ category_id: v || "" })} size="sm" className="w-56"
                        options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="All categories" />
                    <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search paid to / reference / description…"
                        className={inputCls + " !w-72 !rounded-lg !px-3 !py-1.5 !text-xs ml-auto"} />
                </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 font-semibold">Date</th>
                            <th className="p-3 font-semibold">Category</th>
                            <th className="p-3 font-semibold">Paid to</th>
                            <th className="p-3 font-semibold">Reference</th>
                            <th className="p-3 font-semibold">Description</th>
                            <th className="p-3 font-semibold">Method</th>
                            <th className="p-3 font-semibold text-right">Amount</th>
                            <th className="p-3 w-24" />
                        </tr>
                    </thead>
                    <TableBody loading={loading} cols={8}>
                        {list.data.map((e) => (
                            <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                                <td className="p-3 whitespace-nowrap text-slate-700">{fmtDate(e.expense_date)}</td>
                                <td className="p-3 font-semibold text-slate-800">{e.category?.name}</td>
                                <td className="p-3 text-slate-600">{e.paid_to || "—"}</td>
                                <td className="p-3 text-slate-600">{e.reference || "—"}</td>
                                <td className="p-3 text-slate-600 max-w-xs truncate" title={e.comment ?? ""}>{e.comment || "—"}</td>
                                <td className="p-3 text-slate-600">{METHOD_LABEL[e.payment_method] ?? e.payment_method}</td>
                                <td className="p-3 text-right whitespace-nowrap font-semibold text-slate-800">{rs(e.amount)}</td>
                                <td className="p-3">
                                    <div className="flex justify-end items-center gap-1.5">
                                        {can(MODULE, "edit") && (
                                            <button onClick={() => setModal({ expense: e })} title="Edit"
                                                className={iconBtn + "bg-brand-50 text-brand-600 hover:bg-brand-100"}><Ico n="edit" /></button>
                                        )}
                                        {can(MODULE, "delete") && (
                                            <button onClick={() => remove(e)} title="Delete"
                                                className={iconBtn + "bg-red-50 hover:bg-red-100"}><Ico n="trash" /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {list.data.length === 0 && (
                            <tr><td colSpan={8} className="p-10 text-center text-slate-300">{filters.search ? "No expenses match your search" : "No expenses found"}</td></tr>
                        )}
                    </TableBody>
                    {!loading && list.data.length > 0 && (
                        <tfoot>
                            <tr className="bg-slate-50 text-slate-700">
                                <td colSpan={6} className="p-3 text-xs font-semibold uppercase tracking-wide">Total ({list.totals.count} entries)</td>
                                <td className="p-3 text-right whitespace-nowrap font-extrabold">{rs(list.totals.total)}</td>
                                <td />
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            <Pagination data={list} onPage={(p) => setFilters((f) => ({ ...f, page: p }))} />

            {modal && <ExpenseModal expense={modal.expense} categories={categories} onClose={() => setModal(null)}
                onSaved={() => { setModal(null); load(); }} />}
        </div>
    );
}
