import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import DateRangeFilter, { filterBtn, fmtDate, rangeLabel } from "../DateRangeFilter";
import { useDialog } from "../Dialog";
import { Btn, DatePicker, Field, Ico, Modal, Pagination, Select, Spinner, StatusText, TableBody, inputCls, useLoading } from "../ui";
import { escapeHtml as esc, localToday, printHtml } from "../utils";

/* Salary payments and advances of employees (permission module: employee-payments). */
export const PAYMENTS_MODULE = "employee-payments";

/* keep in sync with EmployeePayment::PAYMENT_METHODS / TYPES */
const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "bank", label: "Bank" },
    { value: "other", label: "Other" },
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));
const TYPE_FILTERS = [{ value: "", label: "All" }, { value: "salary", label: "Salary" }, { value: "advance", label: "Advance" }];
const UNIT_LABEL = { monthly: "Months", weekly: "Weeks", daily: "Days worked" };
const UNIT_SINGULAR = { monthly: "month", weekly: "week", daily: "day" };

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
/** "Cook", or just the typed type for Other ("Helper"); "Other" when nothing was typed */
export const employeeType = (l) => (l?.user_type === "other" && l.user_type_other ? l.user_type_other : cap(l?.user_type));
export const rs = (v) => `Rs. ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const money = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => (Number(v) ? money(v) : "");
const errorMessage = (err, fallback) =>
    Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message ?? fallback;
const periodText = (r) => (r.period_from ? `${fmtDate(r.period_from)} – ${fmtDate(r.period_to)}` : "");
const slipNo = (p) => `${p.type === "advance" ? "ADV" : "SAL"}-${String(p.id).padStart(5, "0")}`;

/* local YYYY-MM-DD helpers for the default salary period */
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** this month for monthly pay, this week (Mon–Sun) for weekly, today for daily */
function defaultPeriod(payType) {
    const today = new Date(`${localToday()}T00:00:00`);
    if (payType === "monthly") {
        return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    }
    if (payType === "weekly") {
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { from: ymd(monday), to: ymd(sunday) };
    }
    return { from: localToday(), to: localToday() };
}

/** 422 field errors -> { field: first message }, other failures -> alert */
async function submit(request, { setErrors, dialog }) {
    try {
        return await request();
    } catch (err) {
        if (err.response?.status === 422 && err.response.data.errors) {
            const fieldErrors = Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, v[0]]));
            setErrors(fieldErrors);
            // errors that don't belong to a form field (inactive employee, type change)
            if (fieldErrors.employee || fieldErrors.type) {
                dialog.alert(fieldErrors.employee ?? fieldErrors.type, { title: "Couldn't save", variant: "warning" });
            }
        } else {
            dialog.alert(errorMessage(err, "The payment could not be saved. Try again."), { title: "Couldn't save", variant: "danger" });
        }
        return null;
    }
}

/* ================= 80mm salary / advance slip (same style as the vendor receipt) ================= */
export async function printPaymentSlip(id, dialog) {
    let d;
    try {
        d = (await api.get(`/admin/employee-payments/${id}/slip`)).data;
    } catch (err) {
        dialog?.alert(errorMessage(err, "The slip could not be printed."), { title: "Couldn't print", variant: "danger" });
        return;
    }
    const p = d.payment;
    const l = d.employee;
    const isAdvance = p.type === "advance";
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value, cls = "summary-row") => `<div class="${cls}"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;
    const units = p.units != null ? `${Number(p.units).toLocaleString()} ${UNIT_SINGULAR[l.pay_type] ?? ""}(s)` : "";

    printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(slipNo(p))}</title>
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
    <div style="font-weight:700;">${isAdvance ? "ADVANCE SLIP" : "SALARY SLIP"}</div>
    <div style="font-size:12px;margin-bottom:8px;">${esc(slipNo(p))}</div>
</div>
<div class="meta">
    ${line("Date", fmtDate(p.date))}
    ${line("Employee", l.name)}
    ${line("Type", employeeType(l))}
    ${line("Phone", l.phone)}
    ${line("CNIC", l.cnic)}
</div>
<hr/>
<div class="meta">
    ${isAdvance ? "" : line("Period", periodText(p))}
    ${isAdvance ? "" : line("Pay", `Rs. ${money(l.pay_rate)} / ${l.pay_type}`)}
    ${isAdvance ? "" : line("Units", units)}
    ${line("Payment Method", METHOD_LABEL[p.payment_method] ?? p.payment_method)}
</div>
${isAdvance ? "" : row("Salary earned", `Rs. ${money(p.earned)}`)}
${isAdvance ? "" : row("Less advance", `- Rs. ${money(p.advance_deducted)}`)}
<div class="total-row"><span>${isAdvance ? "ADVANCE PAID" : "NET PAID"}</span><span class="amt">Rs. ${money(p.cash_paid)}</span></div>
${p.comment ? `<div class="comment"><b>Comment:</b> ${esc(p.comment)}</div>` : ""}
<hr/>
${row("Outstanding advance after", `Rs. ${money(d.outstanding_after)}`)}
${d.outstanding_now !== d.outstanding_after ? row("Outstanding advance now", `Rs. ${money(d.outstanding_now)}`) : ""}
<div class="sign"><span>Received by</span><span>Authorized by</span></div>
<div class="footer">
    ${p.created_by ? `Entered by ${esc(p.created_by)}<br>` : ""}
    Printed ${esc(new Date().toLocaleString("en-GB"))}
</div>
</body>
</html>`);
}

/** filters line for the prints: type, employee (payroll) and search */
const filterLines = (d, line) => [
    d.type ? line("Type", cap(d.type)) : "",
    d.employee ? line("Employee", d.employee) : "",
    d.search ? line("Search", `"${d.search}"`) : "",
].join("");

/* ================= A4 print (every row of the filters): employee ledger, or payroll when d.employee is missing ================= */
function printPaymentsLedger(d) {
    const rows = d.rows.data;   // already oldest first
    const l = d.employee;
    const t = d.totals;
    const head = ["Date", ...(l ? [] : ["Employee"]), "Type", "Period", "Method", "Comment", "Earned", "Advance given", "Advance deducted", "Cash paid"];
    const lead = l ? 5 : 6;   // columns before the amounts
    const line = (label, value) => `<div><b>${esc(label)}:</b> ${esc(value)}</div>`;
    printHtml(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${l ? `Ledger - ${esc(l.name)}` : "Payroll"}</title>
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
<h1>${l ? "Employee Ledger" : "Payroll"}</h1>
<div class="meta">
    <div>
        ${l ? `<div style="font-size:14px;font-weight:bold;">${esc(l.name)}</div>
        <div>${esc(employeeType(l))} · Rs. ${money(l.pay_rate)} / ${esc(l.pay_type)}</div>
        ${l.phone ? `<div class="muted">${esc(l.phone)}</div>` : ""}`
        : `<div style="font-size:14px;font-weight:bold;">${esc(d.restaurant)}</div><div>Salaries and advances paid to employees</div>`}
    </div>
    <div style="text-align:right;">
        ${line("Period", rangeLabel(d.range))}
        ${filterLines(d, line)}
        ${l ? line("Outstanding advance", `Rs. ${money(l.outstanding_advance)}`) : line("Total paid to staff", `Rs. ${money(t.total_paid)}`)}
    </div>
</div>
<table>
    <thead><tr>${head.map((h, i) => `<th class="${i >= lead ? "n" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>
        ${rows.map((r) => `<tr>
            <td>${esc(fmtDate(r.date))}</td>
            ${l ? "" : `<td>${esc(r.employee?.name)}</td>`}
            <td>${r.type === "advance" ? "Advance" : "Salary"}</td>
            <td>${esc(periodText(r))}</td>
            <td>${esc(METHOD_LABEL[r.payment_method] ?? r.payment_method)}</td>
            <td>${esc(r.comment)}</td>
            <td class="n">${num(r.earned)}</td>
            <td class="n">${num(r.advance_given)}</td>
            <td class="n">${num(r.advance_deducted)}</td>
            <td class="n">${money(r.cash_paid)}</td>
        </tr>`).join("")}
        ${rows.length === 0 ? `<tr><td colspan="${head.length}" class="muted" style="text-align:center;padding:12px;">No payments in this period</td></tr>` : ""}
        <tr class="strong"><td colspan="${lead}">Totals (${t.count} entries)</td>
            <td class="n">${money(t.salaries_earned)}</td><td class="n">${money(t.advances_given)}</td>
            <td class="n">${money(t.advances_deducted)}</td><td class="n">${money(t.total_paid)}</td></tr>
    </tbody>
</table>
<div class="footer">Cash paid = advances given + net salaries (earned - advance deducted). Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`);
}

/* ================= 80mm short receipt (same style as the vendor's short ledger receipt) ================= */
function printShortPayments(d) {
    const rows = d.rows.data;   // already oldest first
    const l = d.employee;
    const t = d.totals;
    const short = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
    const count = (type) => (d.search ? "" : ` (${rows.filter((r) => r.type === type).length})`);
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value) => `<div class="summary-row"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;

    printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${l ? `Ledger - ${esc(l.name)}` : "Payroll"}</title>
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
    <div style="font-weight:700;margin-bottom:8px;">${l ? "EMPLOYEE LEDGER" : "PAYROLL"}</div>
</div>
<div class="meta">
    ${l ? line("Employee", l.name) : ""}
    ${l ? line("Pay", `Rs. ${short(l.pay_rate)} / ${l.pay_type}`) : ""}
    ${l ? line("Phone", l.phone) : ""}
    ${line("Period", rangeLabel(d.range))}
    ${filterLines(d, line)}
</div>
<hr/>
<table>
    <thead><tr><th>Date</th><th>${l ? "Type" : "Employee"}</th><th class="n">Ded.</th><th class="n">Paid</th></tr></thead>
    <tbody>
        ${rows.map((r) => `<tr>
            <td>${ddmm(r.date)}</td>
            <td>${l ? (r.type === "advance" ? "ADV" : "SAL") : `${esc(r.employee?.name)} ${r.type === "advance" ? "(A)" : "(S)"}`}</td>
            <td class="n">${Number(r.advance_deducted) ? short(r.advance_deducted) : ""}</td>
            <td class="n">${short(r.cash_paid)}</td>
        </tr>`).join("")}
        ${rows.length === 0 ? `<tr><td colspan="4" class="center" style="padding:6px 0;">No payments in this period</td></tr>` : ""}
    </tbody>
</table>
<hr/>
${row(`Advances given${count("advance")}`, money(t.advances_given))}
${row(`Salaries earned${count("salary")}`, money(t.salaries_earned))}
${row("Advances deducted", money(t.advances_deducted))}
${row("Net salaries", money(t.net_salaries))}
<div class="total-row"><span>TOTAL PAID</span><span class="amt">Rs. ${money(t.total_paid)}</span></div>
${l ? row("Outstanding advance", `Rs. ${money(l.outstanding_advance)}`) : ""}
<div class="footer">${l ? "" : "(S) salary, (A) advance<br>"}Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`);
}

/** Print Short Receipt + Print Ledger buttons; both print every row of the current filters (loaded with ?all=1) */
function PrintButtons({ load, dialog }) {
    const [printing, setPrinting] = useState(false);
    const print = async (kind) => {
        setPrinting(kind);
        try {
            const d = await load();
            (kind === "short" ? printShortPayments : printPaymentsLedger)(d);
        } catch (err) {
            dialog.alert(errorMessage(err, "The ledger could not be printed."), { title: "Couldn't print", variant: "danger" });
        } finally { setPrinting(false); }
    };
    const cls = "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50";
    return (
        <>
            <Btn onClick={() => print("short")} disabled={!!printing} title="Print a short 80mm receipt of this ledger" className={cls}>
                <Ico n="print" /> {printing === "short" ? "Preparing…" : "Print Short Receipt"}
            </Btn>
            <Btn onClick={() => print("ledger")} disabled={!!printing} className={cls}>
                <Ico n="print" /> {printing === "ledger" ? "Preparing…" : "Print Ledger"}
            </Btn>
        </>
    );
}

/* ================= pay salary ================= */
/** employee: { id, name, pay_type, pay_rate }; payment: a ledger row when editing */
export function SalaryModal({ employee, payment, onClose, onSaved }) {
    const dialog = useDialog();
    const [form, setForm] = useState(() => {
        const period = defaultPeriod(employee.pay_type);
        return {
            period_from: payment?.period_from ?? period.from,
            period_to: payment?.period_to ?? period.to,
            // "" / null = use the server's suggestion
            units: payment?.units != null ? String(payment.units) : "",
            earned: payment ? String(payment.earned) : null,
            deducted: payment ? String(payment.advance_deducted) : null,
            payment_date: payment?.date ?? localToday(),
            payment_method: payment?.payment_method ?? "cash",
            comment: payment?.comment ?? "",
        };
    });
    const [sug, setSug] = useState(null);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (changes) => setForm((f) => ({ ...f, ...changes }));

    // suggestion (units, earned, outstanding advance, overlapping paid periods) for the chosen period
    useEffect(() => {
        if (!form.period_from || !form.period_to) return;
        const t = setTimeout(() => {
            api.get(`/admin/employees/${employee.id}/salary-suggestion`, {
                params: {
                    period_from: form.period_from, period_to: form.period_to,
                    units: form.units !== "" ? form.units : undefined, payment_id: payment?.id,
                },
            }).then((r) => setSug(r.data)).catch(() => setSug(null));
        }, 250);
        return () => clearTimeout(t);
    }, [form.period_from, form.period_to, form.units]); // eslint-disable-line

    const outstanding = sug?.outstanding_advance ?? 0;
    const earned = form.earned ?? (sug ? String(sug.earned) : "");
    const deducted = form.deducted ?? String(Math.max(0, Math.min(outstanding, Number(earned) || 0)));
    const net = Math.round(((Number(earned) || 0) - (Number(deducted) || 0)) * 100) / 100;
    const overlaps = sug?.already_paid_periods ?? [];

    const save = async ({ print = false } = {}) => {
        const e = {};
        if (!form.period_from || !form.period_to) e.period_from = "Choose the salary period.";
        if (!(Number(earned) > 0)) e.earned = "Enter the earned amount (greater than 0).";
        if (Number(deducted) < 0 || Number(deducted) > outstanding) e.advance_deducted = `Deduct between 0 and ${rs(outstanding)}.`;
        else if (net < 0) e.advance_deducted = "The deduction cannot be more than the salary earned.";
        if (overlaps.length) e.period_from = "This period overlaps a salary that is already paid.";
        setErrors(e);
        if (Object.keys(e).length) return;

        setSaving(print ? "print" : "save");
        const payload = {
            type: "salary", payment_date: form.payment_date, period_from: form.period_from, period_to: form.period_to,
            units: form.units !== "" ? Number(form.units) : sug?.units ?? null,
            earned: Number(earned), advance_deducted: Number(deducted) || 0,
            payment_method: form.payment_method, comment: form.comment || null,
        };
        const r = await submit(() => (payment
            ? api.post(`/admin/employee-payments/${payment.id}`, payload)
            : api.post(`/admin/employees/${employee.id}/payments`, payload)), { setErrors, dialog });
        setSaving(false);
        if (!r) return;
        onSaved();
        if (print) printPaymentSlip(r.data.id, dialog);
    };

    const err = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

    return (
        <Modal title={`${payment ? "Edit salary" : "Pay salary"} · ${employee.name}`} onClose={onClose} className="max-w-lg"
            footer={<SaveButtons saving={saving} onClose={onClose} onSave={save} />}>
            <p className="text-xs text-slate-500 mb-4">
                Pay: {rs(sug?.pay_rate ?? employee.pay_rate)} / {sug?.pay_type ?? employee.pay_type}. Net paid (earned − advance deducted) is the cash handed over.
            </p>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Period" required>
                        <DatePicker range value={{ from: form.period_from, to: form.period_to }}
                            onChange={(r) => set({ period_from: r.from, period_to: r.to, units: "", earned: null, deducted: null })} />
                        {err("period_from")}{err("period_to")}
                    </Field>
                    <Field label={UNIT_LABEL[employee.pay_type] ?? "Units"}>
                        <input type="number" min="0" step="0.01" value={form.units !== "" ? form.units : sug?.units ?? ""}
                            onChange={(e) => set({ units: e.target.value, earned: null, deducted: null })} className={inputCls} />
                        {err("units")}
                    </Field>
                </div>

                {overlaps.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Already paid for an overlapping period:
                        {overlaps.map((o) => <div key={o.id}>#{o.id}: {periodText(o)} (paid {fmtDate(o.payment_date)}, {rs(o.amount)})</div>)}
                        Change the period before saving.
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Earned (suggested, editable)" required>
                        <input type="number" min="0.01" step="0.01" value={earned}
                            onChange={(e) => set({ earned: e.target.value, deducted: null })} className={inputCls} />
                        {err("earned")}
                    </Field>
                    <Field label="Advance to deduct">
                        <input type="number" min="0" max={outstanding} step="0.01" value={deducted} disabled={outstanding <= 0}
                            onChange={(e) => set({ deducted: e.target.value })} className={inputCls + " disabled:bg-slate-50"} />
                        <p className="text-xs text-slate-400 mt-1">Outstanding: {rs(outstanding)}</p>
                        {err("advance_deducted")}
                    </Field>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-600">Net to pay</span>
                    <span className={"text-lg font-extrabold " + (net < 0 ? "text-red-600" : "text-slate-800")}>{rs(net)}</span>
                </div>

                <PaymentFields form={form} set={set} err={err} />
            </div>
        </Modal>
    );
}

/* ================= give advance ================= */
export function AdvanceModal({ employee, payment, onClose, onSaved }) {
    const dialog = useDialog();
    const [form, setForm] = useState(() => ({
        amount: payment ? String(payment.advance_given) : "",
        payment_date: payment?.date ?? localToday(),
        payment_method: payment?.payment_method ?? "cash",
        comment: payment?.comment ?? "",
    }));
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (changes) => setForm((f) => ({ ...f, ...changes }));

    const save = async ({ print = false } = {}) => {
        const e = {};
        if (!(Number(form.amount) > 0)) e.amount = "Enter an amount greater than 0.";
        setErrors(e);
        if (Object.keys(e).length) return;

        setSaving(print ? "print" : "save");
        const payload = {
            type: "advance", amount: Number(form.amount), payment_date: form.payment_date,
            payment_method: form.payment_method, comment: form.comment || null,
        };
        const r = await submit(() => (payment
            ? api.post(`/admin/employee-payments/${payment.id}`, payload)
            : api.post(`/admin/employees/${employee.id}/payments`, payload)), { setErrors, dialog });
        setSaving(false);
        if (!r) return;
        onSaved();
        if (print) printPaymentSlip(r.data.id, dialog);
    };

    const err = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

    return (
        <Modal title={`${payment ? "Edit advance" : "Give advance"} · ${employee.name}`} onClose={onClose}
            footer={<SaveButtons saving={saving} onClose={onClose} onSave={save} />}>
            <p className="text-xs text-slate-500 mb-4">Cash given before salary. It is deducted from a later salary payment.</p>
            <div className="space-y-4">
                <Field label="Amount" required>
                    <input type="number" min="0.01" step="0.01" value={form.amount} autoFocus
                        onChange={(e) => set({ amount: e.target.value })} className={inputCls} />
                    {err("amount")}
                </Field>
                <PaymentFields form={form} set={set} err={err} />
            </div>
        </Modal>
    );
}

/** date, method and comment: shared by both dialogs */
function PaymentFields({ form, set, err }) {
    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                <Field label="Payment date" required>
                    <DatePicker value={form.payment_date} max={localToday()} onChange={(v) => set({ payment_date: v })} />
                    {err("payment_date")}
                </Field>
                <Field label="Payment method" required>
                    <Select value={form.payment_method} onChange={(v) => set({ payment_method: v })} options={PAYMENT_METHODS}
                        searchable={false} clearable={false} />
                    {err("payment_method")}
                </Field>
            </div>
            <Field label="Comment">
                <textarea rows={2} value={form.comment} onChange={(e) => set({ comment: e.target.value })} className={inputCls} />
                {err("comment")}
            </Field>
        </>
    );
}

function SaveButtons({ saving, onClose, onSave }) {
    return (
        <>
            <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
            <Btn onClick={() => onSave({ print: true })} disabled={!!saving} title="Save and print the slip"
                className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <Ico n="print" /> {saving === "print" ? "Saving…" : "Save & Print"}
            </Btn>
            <Btn onClick={() => onSave()} disabled={!!saving} className="bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                {saving === "save" ? "Saving…" : "Save"}
            </Btn>
        </>
    );
}

/** the salary or advance dialog for a ledger row (edit) or a new payment of `type` */
export function PaymentModal({ type, ...props }) {
    return type === "advance" ? <AdvanceModal {...props} /> : <SalaryModal {...props} />;
}

/* ================= shared list filters (kept in the URL so refresh / back keep them) ================= */
function usePaymentFilters(defaultRange) {
    const [params, setParams] = useSearchParams();
    const f = {
        range: params.get("range") ?? defaultRange,
        from: params.get("from") ?? "",
        to: params.get("to") ?? "",
        type: params.get("type") ?? "",
        employee: params.get("employee") ?? "",
        q: params.get("q") ?? "",
        page: Number(params.get("page") ?? 1),
    };
    const [search, setSearch] = useState(f.q);

    /** update some query keys; any filter change goes back to page 1 */
    const update = (changes, { keepPage = false } = {}) => {
        const next = new URLSearchParams(params);
        Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
        if (!keepPage) next.delete("page");
        setParams(next, { replace: true });
    };

    // back / forward can change ?q= under us
    useEffect(() => { setSearch(f.q); }, [f.q]); // eslint-disable-line

    // debounced comment search, like the list pages
    const firstSearch = useRef(true);
    useEffect(() => {
        if (firstSearch.current) { firstSearch.current = false; return; }
        const t = setTimeout(() => { if (search !== f.q) update({ q: search.trim() }); }, 300);
        return () => clearTimeout(t);
    }, [search]); // eslint-disable-line

    /** the API query (?preset= or ?from=&to=, type, search, employee_id) */
    const query = () => ({
        preset: f.range,
        ...(f.range === "custom" ? { from: f.from || undefined, to: f.to || undefined } : {}),
        type: f.type || undefined,
        search: f.q || undefined,
        employee_id: f.employee || undefined,
    });

    return { f, update, query, search, setSearch, key: params.toString() };
}

/** row 1: date range; row 2: type, extra filters (children, e.g. employee) and search, all at the small button size */
function FiltersBar({ filters, resolved, children }) {
    const { f, update, search, setSearch } = filters;
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <DateRangeFilter range={f.range} from={f.from} to={f.to} resolved={resolved} onChange={(changes) => update(changes)} />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-400 mr-1">Type</span>
                {TYPE_FILTERS.map((t) => (
                    <button key={t.value} type="button" onClick={() => update({ type: t.value })} className={filterBtn(f.type === t.value)}>{t.label}</button>
                ))}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {children}
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search comment…"
                        className={inputCls + " !w-56 !rounded-lg !px-3 !py-1.5 !text-xs"} />
                </div>
            </div>
        </div>
    );
}

/* ================= payments table (employee ledger and payroll) ================= */
function PaymentsTable({ d, showEmployee = false, actions, emptyText, loading = false }) {
    const rows = d.rows.data;
    const t = d.totals;
    const lead = showEmployee ? 5 : 4;   // columns before the amounts
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                        <th className="p-3 font-semibold">Date</th>
                        {showEmployee && <th className="p-3 font-semibold">Employee</th>}
                        <th className="p-3 font-semibold">Type</th>
                        <th className="p-3 font-semibold">Period</th>
                        <th className="p-3 font-semibold">Comment</th>
                        <th className="p-3 font-semibold text-right">Earned</th>
                        <th className="p-3 font-semibold text-right">Advance given</th>
                        <th className="p-3 font-semibold text-right">Advance deducted</th>
                        <th className="p-3 font-semibold text-right">Cash paid</th>
                        <th className="p-3 w-28" />
                    </tr>
                </thead>
                <TableBody loading={loading} cols={lead + 5}>
                    {rows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                            <td className="p-3 whitespace-nowrap text-slate-700">{fmtDate(r.date)}</td>
                            {showEmployee && (
                                <td className="p-3 whitespace-nowrap">
                                    <Link to={`/employees/${r.employee_id}/ledger`} className="font-semibold text-slate-800 hover:text-brand-600">{r.employee?.name}</Link>
                                    <p className="text-xs text-slate-400">{employeeType(r.employee)}</p>
                                </td>
                            )}
                            <td className="p-3 whitespace-nowrap">
                                <span className={"text-xs font-bold px-2 py-1 rounded-full " +
                                    (r.type === "advance" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                                    {r.type === "advance" ? "Advance" : "Salary"}
                                </span>
                                <span className="text-xs text-slate-400 ml-1.5">{METHOD_LABEL[r.payment_method] ?? r.payment_method}</span>
                            </td>
                            <td className="p-3 whitespace-nowrap text-slate-600">{periodText(r) || "—"}</td>
                            <td className="p-3 text-slate-600 max-w-xs break-words">{r.comment || "—"}</td>
                            <td className="p-3 text-right whitespace-nowrap">{num(r.earned)}</td>
                            <td className="p-3 text-right whitespace-nowrap">{num(r.advance_given)}</td>
                            <td className="p-3 text-right whitespace-nowrap">{num(r.advance_deducted)}</td>
                            <td className="p-3 text-right whitespace-nowrap font-semibold text-slate-800">{money(r.cash_paid)}</td>
                            <td className="p-3"><div className="flex justify-end items-center gap-1.5">{actions(r)}</div></td>
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr><td colSpan={lead + 5} className="p-10 text-center text-slate-300">{emptyText}</td></tr>
                    )}
                </TableBody>
                <tfoot className={loading ? "hidden" : ""}>
                    <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
                        <td className="p-3" colSpan={lead}>Totals ({t.count} entries)</td>
                        <td className="p-3 text-right">{money(t.salaries_earned)}</td>
                        <td className="p-3 text-right">{money(t.advances_given)}</td>
                        <td className="p-3 text-right">{money(t.advances_deducted)}</td>
                        <td className="p-3 text-right">{money(t.total_paid)}</td>
                        <td />
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

const iconBtn = "w-8 h-8 rounded-lg flex items-center justify-center ";

/* ================= employee ledger page (/employees/:id/ledger) ================= */
export function EmployeeLedger() {
    const { id } = useParams();
    const nav = useNavigate();
    const { can } = useAuth();
    const dialog = useDialog();
    const filters = usePaymentFilters("all");
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [loading, track] = useLoading();
    const [modal, setModal] = useState(null); // { type, payment? }

    const load = () => track(api.get(`/admin/employees/${id}/ledger`, { params: { ...filters.query(), page: filters.f.page } })
        .then((r) => { setD(r.data); setError(""); })
        .catch((err) => {
            if (err.response?.status === 404) return nav("/employees", { replace: true });
            setError(errorMessage(err, "The ledger could not be loaded."));
        }));

    useEffect(() => { load(); }, [id, filters.key]); // eslint-disable-line

    const loadAll = async () => (await api.get(`/admin/employees/${id}/ledger`, { params: { ...filters.query(), all: 1 } })).data;

    const remove = async (row) => {
        const what = row.type === "advance" ? "advance" : "salary payment";
        if (!(await dialog.confirm(`This ${what} of ${rs(row.cash_paid)} on ${fmtDate(row.date)} will be permanently deleted. This can't be undone.`,
            { title: `Delete this ${what}?`, okText: "Delete" }))) return;
        try {
            await api.delete(`/admin/employee-payments/${row.id}`);
            load();
        } catch (err) {
            dialog.alert(errorMessage(err, "The payment could not be deleted."), { title: "Can't delete", variant: "warning" });
        }
    };

    if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;

    const l = d.employee;
    const canAdd = can(PAYMENTS_MODULE, "create") && l.status;
    const canEdit = can(PAYMENTS_MODULE, "edit");
    const canDelete = can(PAYMENTS_MODULE, "delete");
    const disabledTitle = !l.status ? "This employee is disabled" : undefined;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link to="/employees" className="text-xs font-semibold text-slate-400 hover:text-slate-600">← Employees</Link>
                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                        {l.name}
                        {!l.status && <span className="text-xs bg-slate-100 px-2 py-1 rounded-full"><StatusText on={false} /></span>}
                    </h2>
                    <p className="text-sm text-slate-500">{[employeeType(l), `${rs(l.pay_rate)} / ${l.pay_type}`, l.phone].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2 text-right mr-2">
                        <p className="text-xs text-slate-400 font-medium">Outstanding advance</p>
                        <p className={"text-lg font-extrabold " + (l.outstanding_advance > 0 ? "text-amber-600" : "text-slate-500")}>{rs(l.outstanding_advance)}</p>
                    </div>
                    <PrintButtons load={loadAll} dialog={dialog} />
                    {can(PAYMENTS_MODULE, "create") && (
                        <>
                            <Btn onClick={() => setModal({ type: "advance" })} disabled={!canAdd} title={disabledTitle}
                                className="bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"><Ico n="plus" /> Give advance</Btn>
                            <Btn onClick={() => setModal({ type: "salary" })} disabled={!canAdd} title={disabledTitle}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"><Ico n="plus" /> Pay salary</Btn>
                        </>
                    )}
                </div>
            </div>

            <FiltersBar filters={filters} resolved={d.range} />

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            <PaymentsTable d={d} loading={loading} emptyText={filters.f.q ? "No payments match your search" : "No payments in this period"}
                actions={(r) => (
                    <>
                        <button onClick={() => printPaymentSlip(r.id, dialog)} title="Print slip"
                            className={iconBtn + "bg-slate-100 text-slate-600 hover:bg-slate-200"}><Ico n="print" /></button>
                        {canEdit && <button onClick={() => setModal({ type: r.type, payment: r })} title="Edit"
                            className={iconBtn + "bg-brand-50 text-brand-600 hover:bg-brand-100"}><Ico n="edit" /></button>}
                        {canDelete && <button onClick={() => remove(r)} title="Delete"
                            className={iconBtn + "bg-red-50 hover:bg-red-100"}><Ico n="trash" /></button>}
                    </>
                )} />

            <Pagination data={d.rows} onPage={(p) => filters.update({ page: String(p) }, { keepPage: true })} />

            {modal && <PaymentModal type={modal.type} employee={l} payment={modal.payment} onClose={() => setModal(null)}
                onSaved={() => { setModal(null); load(); }} />}
        </div>
    );
}

/* ================= payroll page (/payroll): every employee's payments ================= */
export function Payroll() {
    const dialog = useDialog();
    const filters = usePaymentFilters("this_month");
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [employees, setEmployees] = useState([]);
    const [loading, track] = useLoading();

    useEffect(() => {
        api.get("/admin/employees/all").then((r) => setEmployees(r.data.map((e) => ({ value: String(e.id), label: e.name })))).catch(() => {});
    }, []);

    useEffect(() => {
        track(api.get("/admin/employee-payments", { params: { ...filters.query(), page: filters.f.page } })
            .then((r) => { setD(r.data); setError(""); })
            .catch((err) => setError(errorMessage(err, "The payroll could not be loaded."))));
    }, [filters.key]); // eslint-disable-line

    // every row of the current filters, plus the picked employee's name for the print header
    const loadAll = async () => {
        const r = await api.get("/admin/employee-payments", { params: { ...filters.query(), all: 1 } });
        return { ...r.data, employee: employees.find((e) => e.value === filters.f.employee)?.label };
    };

    if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;
    const t = d.totals;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">Payroll</h2>
                    <p className="text-sm text-slate-500">Salaries and advances paid to all employees · {rangeLabel(d.range)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <PrintButtons load={loadAll} dialog={dialog} />
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    ["Total paid to staff", t.total_paid, "!border-t-brand-500", "Advances + net salaries"],
                    ["Advances given", t.advances_given, "!border-t-amber-500"],
                    ["Net salaries paid", t.net_salaries, "!border-t-emerald-500"],
                    ["Advances deducted", t.advances_deducted, "!border-t-slate-400", "Not cash: already paid as advances"],
                ].map(([label, val, accent, hint]) => (
                    <div key={label} className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + accent}>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-xl font-extrabold text-slate-800 mt-1">{rs(val)}</p>
                        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
                    </div>
                ))}
            </div>

            <FiltersBar filters={filters} resolved={d.range}>
                <Select value={filters.f.employee} onChange={(v) => filters.update({ employee: v ?? "" })} options={employees}
                    placeholder="All employees" size="sm" className="w-48" />
            </FiltersBar>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            <PaymentsTable d={d} showEmployee loading={loading} emptyText={filters.f.q ? "No payments match your search" : "No payments in this period"}
                actions={(r) => (
                    <button onClick={() => printPaymentSlip(r.id, dialog)} title="Print slip"
                        className={iconBtn + "bg-slate-100 text-slate-600 hover:bg-slate-200"}><Ico n="print" /></button>
                )} />

            <Pagination data={d.rows} onPage={(p) => filters.update({ page: String(p) }, { keepPage: true })} />
        </div>
    );
}
