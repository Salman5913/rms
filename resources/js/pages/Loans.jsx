import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../auth";
import DateRangeFilter, { filterBtn, fmtDate } from "../DateRangeFilter";
import { useDialog } from "../Dialog";
import { ActionMenu, Btn, DatePicker, Field, Ico, Modal, Pagination, Select, Spinner, StatusText, TableBody, inputCls, useLoading } from "../ui";
import { escapeHtml as esc, localToday, printHtml } from "../utils";

/* Business loans the restaurant has taken (permission module: loans). Never part of Profit & Loss. */
export const MODULE = "loans";

/* keep in sync with LoanRepayment::PAYMENT_METHODS */
export const PAYMENT_METHODS = [
    { value: "cash", label: "Cash" },
    { value: "bank", label: "Bank" },
    { value: "other", label: "Other" },
];
export const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

/* keep in sync with Loan::STATUSES */
const STATUS_FILTERS = [{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "paid", label: "Paid off" }];

export const rs = (v) => `Rs. ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const money = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const errorMessage = (err, fallback) =>
    Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message ?? fallback;
export const iconBtn = "w-8 h-8 rounded-lg flex items-center justify-center ";

/** "Active" (green) while something is owed, "Paid off" (grey) once fully repaid */
export function LoanStatus({ status }) {
    return <StatusText on={status === "active"} offText="Paid off" />;
}

/** a failed save: 422 errors go next to their fields, anything else is shown in a dialog */
function showSaveError(err, setErrors, dialog) {
    if (err.response?.status === 422 && err.response.data.errors) {
        setErrors(Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, v[0]])));
    } else {
        dialog.alert(errorMessage(err, "Could not save. Try again."), { title: "Couldn't save", variant: "danger" });
    }
}

/* ================= 80mm receipt of one repayment (same style as the vendor payment receipt) ================= */
export async function printRepaymentReceipt(loanId, repaymentId, dialog) {
    let d;
    try {
        // the statement has the "remaining after" of every repayment
        d = (await api.get(`/admin/loans/${loanId}/statement`)).data;
    } catch (err) {
        dialog?.alert(errorMessage(err, "The receipt could not be printed."), { title: "Couldn't print", variant: "danger" });
        return;
    }
    const loan = d.loan;
    const r = d.repayments.find((x) => x.id === repaymentId);
    if (!r) return;
    const receiptNo = `LRP-${String(r.id).padStart(5, "0")}`;
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value) => `<div class="summary-row"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;

    printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(receiptNo)}</title>
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
    <div style="font-weight:700;">LOAN REPAYMENT</div>
    <div style="font-size:12px;margin-bottom:8px;">${esc(receiptNo)}</div>
</div>
<div class="meta">
    ${line("Date", fmtDate(r.repayment_date))}
    ${line("Lender", loan.lender_name)}
    ${line("Phone", loan.lender_phone)}
    ${line("Loan", `Rs. ${money(loan.amount)} on ${fmtDate(loan.loan_date)}`)}
    ${line("Reference", loan.reference)}
</div>
<hr/>
<div class="meta">${line("Payment Method", METHOD_LABEL[r.payment_method] ?? r.payment_method)}</div>
${row("Remaining before", `Rs. ${money(r.remaining_after + r.amount)}`)}
<div class="total-row"><span>AMOUNT REPAID</span><span class="amt">Rs. ${money(r.amount)}</span></div>
${r.comment ? `<div class="comment"><b>Comment:</b> ${esc(r.comment)}</div>` : ""}
<hr/>
${row("Remaining after this", `Rs. ${money(r.remaining_after)}`)}
${loan.remaining !== r.remaining_after ? row("Remaining now", `Rs. ${money(loan.remaining)}`) : ""}
<div class="sign"><span>Received by</span><span>Authorized by</span></div>
<div class="footer">
    ${r.created_by ? `Entered by ${esc(r.created_by)}<br>` : ""}
    Printed ${esc(new Date().toLocaleString("en-GB"))}
</div>
</body>
</html>`);
}

/* ================= add / edit repayment ================= */
export function RepaymentModal({ loan, repayment, onClose, onSaved }) {
    const dialog = useDialog();
    const [form, setForm] = useState({
        repayment_date: repayment?.repayment_date ?? localToday(),
        amount: repayment ? String(repayment.amount) : "",
        payment_method: repayment?.payment_method ?? "cash",
        comment: repayment?.comment ?? "",
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // when editing, this repayment's own amount is available again
    const available = Number(loan.remaining) + Number(repayment?.amount ?? 0);

    const save = async (print = false) => {
        setSaving(print ? "print" : "save");
        setErrors({});
        const payload = { ...form, amount: Number(form.amount), comment: form.comment || null };
        try {
            const r = repayment
                ? await api.post(`/admin/loan-repayments/${repayment.id}`, payload)
                : await api.post(`/admin/loans/${loan.id}/repayments`, payload);
            onSaved();
            if (print) printRepaymentReceipt(loan.id, r.data.id, dialog);
        } catch (err) {
            showSaveError(err, setErrors, dialog);
        } finally { setSaving(false); }
    };

    const err = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

    return (
        <Modal title={`${repayment ? "Edit" : "Add"} repayment · ${loan.lender_name}`} onClose={onClose}
            footer={<>
                <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
                <Btn onClick={() => save(true)} disabled={!!saving}
                    className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <Ico n="print" /> {saving === "print" ? "Saving…" : "Save & Print"}
                </Btn>
                <Btn onClick={() => save()} disabled={!!saving} className="bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                    {saving === "save" ? "Saving…" : "Save"}
                </Btn>
            </>}>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Date" required>
                        <DatePicker value={form.repayment_date} min={loan.loan_date} max={localToday()}
                            onChange={(v) => set("repayment_date", v)} />
                        {err("repayment_date")}
                    </Field>
                    <Field label="Amount" required>
                        <input type="number" min="0.01" step="0.01" value={form.amount} autoFocus
                            onChange={(e) => set("amount", e.target.value)} className={inputCls} />
                        <p className="text-xs text-slate-400 mt-1">Remaining: {rs(available)}</p>
                        {err("amount")}
                    </Field>
                </div>
                <Field label="Payment method" required>
                    <Select value={form.payment_method} onChange={(v) => set("payment_method", v)} options={PAYMENT_METHODS}
                        searchable={false} clearable={false} />
                    {err("payment_method")}
                </Field>
                <Field label="Comment">
                    <textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} className={inputCls} />
                    {err("comment")}
                </Field>
            </div>
        </Modal>
    );
}

/* ================= add / edit loan ================= */
function LoanModal({ loan, onClose, onSaved }) {
    const dialog = useDialog();
    const [form, setForm] = useState({
        lender_name: loan?.lender_name ?? "",
        lender_phone: loan?.lender_phone ?? "",
        loan_date: loan?.loan_date ?? localToday(),
        amount: loan ? String(loan.amount) : "",
        reference: loan?.reference ?? "",
        comment: loan?.comment ?? "",
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const save = async () => {
        setSaving(true);
        setErrors({});
        const payload = {
            ...form, amount: Number(form.amount),
            lender_phone: form.lender_phone || null, reference: form.reference || null, comment: form.comment || null,
        };
        try {
            if (loan) await api.post(`/admin/loans/${loan.id}`, payload);
            else await api.post("/admin/loans", payload);
            onSaved();
        } catch (err) {
            showSaveError(err, setErrors, dialog);
        } finally { setSaving(false); }
    };

    const err = (k) => errors[k] && <p className="text-xs text-red-500 mt-1">{errors[k]}</p>;

    return (
        <Modal title={loan ? "Edit loan" : "Add loan"} onClose={onClose}
            footer={<>
                <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
                <Btn onClick={save} disabled={saving} className="bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                    {saving ? "Saving…" : "Save"}
                </Btn>
            </>}>
            <p className="text-xs text-slate-500 mb-4">Money the restaurant borrowed. Not counted in Profit & Loss.</p>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Lender name" required>
                        <input value={form.lender_name} autoFocus onChange={(e) => set("lender_name", e.target.value)} className={inputCls} />
                        {err("lender_name")}
                    </Field>
                    <Field label="Phone">
                        <input value={form.lender_phone} onChange={(e) => set("lender_phone", e.target.value)} className={inputCls} />
                        {err("lender_phone")}
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Loan date" required>
                        <DatePicker value={form.loan_date} max={localToday()} onChange={(v) => set("loan_date", v)} />
                        {err("loan_date")}
                    </Field>
                    <Field label="Amount" required>
                        <input type="number" min="0.01" step="0.01" value={form.amount}
                            onChange={(e) => set("amount", e.target.value)} className={inputCls} />
                        {err("amount")}
                    </Field>
                </div>
                <Field label="Reference (agreement / cheque no.)">
                    <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={inputCls} />
                    {err("reference")}
                </Field>
                <Field label="Comment">
                    <textarea rows={2} value={form.comment} onChange={(e) => set("comment", e.target.value)} className={inputCls} />
                    {err("comment")}
                </Field>
            </div>
        </Modal>
    );
}

/* ================= loan list (/loans) ================= */
export default function Loans() {
    const { can } = useAuth();
    const dialog = useDialog();
    const [filters, setFilters] = useState({ range: "all", from: "", to: "", status: "", search: "", page: 1 });
    const [searchText, setSearchText] = useState("");
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [loading, track] = useLoading();
    const [loanModal, setLoanModal] = useState(null);   // { loan } (loan is undefined when adding)
    const [repayLoan, setRepayLoan] = useState(null);

    /** any filter change goes back to page 1 */
    const change = (changes) => setFilters((f) => ({ ...f, ...changes, page: 1 }));

    const load = () => {
        const params = { range: filters.range, status: filters.status || undefined, search: filters.search || undefined, page: filters.page };
        if (filters.range === "custom") {
            params.from = filters.from || undefined;
            params.to = filters.to || undefined;
        }
        track(api.get("/admin/loans", { params })
            .then((r) => { setD(r.data); setError(""); })
            .catch((err) => setError(errorMessage(err, "The loans could not be loaded."))));
    };

    useEffect(() => { load(); }, [filters]); // eslint-disable-line

    // debounced search, like the list pages
    useEffect(() => {
        const t = setTimeout(() => { if (searchText.trim() !== filters.search) change({ search: searchText.trim() }); }, 300);
        return () => clearTimeout(t);
    }, [searchText]); // eslint-disable-line

    const remove = async (loan) => {
        if (!(await dialog.confirm(`The loan from ${loan.lender_name} of ${rs(loan.amount)} will be permanently deleted. This can't be undone.`,
            { title: "Delete this loan?", okText: "Delete" }))) return;
        try {
            await api.delete(`/admin/loans/${loan.id}`);
            load();
        } catch (err) {
            dialog.alert(errorMessage(err, "The loan could not be deleted."), { title: "Can't delete", variant: "warning" });
        }
    };

    if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;
    const t = d.totals;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">Loans</h2>
                    <p className="text-sm text-slate-500">Money the restaurant borrowed and what has been repaid. Not part of Profit & Loss.</p>
                </div>
                {can(MODULE, "create") && (
                    <Btn onClick={() => setLoanModal({})} className="bg-brand-600 text-white hover:bg-brand-700"><Ico n="plus" /> Add loan</Btn>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    ["Total borrowed", t.borrowed, "!border-t-brand-500"],
                    ["Total repaid", t.repaid, "!border-t-emerald-500"],
                    ["Total remaining", t.remaining, "!border-t-red-500"],
                ].map(([label, val, accent]) => (
                    <div key={label} className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + accent}>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-xl font-extrabold text-slate-800 mt-1">{rs(val)}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <DateRangeFilter range={filters.range} from={filters.from} to={filters.to} resolved={d.range} onChange={change} />
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs font-semibold text-slate-400 mr-1">Status</span>
                    {STATUS_FILTERS.map((s) => (
                        <button key={s.value} type="button" onClick={() => change({ status: s.value })}
                            className={filterBtn(filters.status === s.value)}>{s.label}</button>
                    ))}
                    <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search lender / phone / reference / comment…"
                        className={inputCls + " !w-72 !rounded-lg !px-3 !py-1.5 !text-xs ml-auto"} />
                </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 font-semibold">Lender</th>
                            <th className="p-3 font-semibold">Phone</th>
                            <th className="p-3 font-semibold">Loan date</th>
                            <th className="p-3 font-semibold text-right">Amount</th>
                            <th className="p-3 font-semibold text-right">Repaid</th>
                            <th className="p-3 font-semibold text-right">Remaining</th>
                            <th className="p-3 font-semibold">Status</th>
                            <th className="p-3 w-32" />
                        </tr>
                    </thead>
                    <TableBody loading={loading} cols={8}>
                        {d.data.map((loan) => (
                            <tr key={loan.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                                <td className="p-3">
                                    <p className="font-semibold text-slate-800">{loan.lender_name}</p>
                                    {loan.reference && <p className="text-xs text-slate-400">{loan.reference}</p>}
                                </td>
                                <td className="p-3 text-slate-600">{loan.lender_phone || "—"}</td>
                                <td className="p-3 whitespace-nowrap text-slate-700">{fmtDate(loan.loan_date)}</td>
                                <td className="p-3 text-right whitespace-nowrap">{rs(loan.amount)}</td>
                                <td className="p-3 text-right whitespace-nowrap text-emerald-700">{rs(loan.repaid)}</td>
                                <td className="p-3 text-right whitespace-nowrap font-semibold text-red-600">{rs(loan.remaining)}</td>
                                <td className="p-3"><LoanStatus status={loan.status} /></td>
                                <td className="p-3">
                                    <div className="flex justify-end items-center gap-1.5">
                                        {can(MODULE, "edit") && (
                                            <button onClick={() => setLoanModal({ loan })} title="Edit"
                                                className={iconBtn + "bg-brand-50 text-brand-600 hover:bg-brand-100"}><Ico n="edit" /></button>
                                        )}
                                        {can(MODULE, "delete") && (
                                            <button onClick={() => remove(loan)} title="Delete"
                                                className={iconBtn + "bg-red-50 hover:bg-red-100"}><Ico n="trash" /></button>
                                        )}
                                        {/* secondary actions live in one "⋯" menu, like the vendor list */}
                                        <ActionMenu items={[
                                            { label: "View statement", icon: "book", to: `/loans/${loan.id}` },
                                            can(MODULE, "create") && loan.status === "active" && {
                                                label: "Add repayment", icon: "cash", className: "text-emerald-700", onClick: () => setRepayLoan(loan),
                                            },
                                        ]} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {d.data.length === 0 && (
                            <tr><td colSpan={8} className="p-10 text-center text-slate-300">{filters.search ? "No loans match your search" : "No loans found"}</td></tr>
                        )}
                    </TableBody>
                </table>
            </div>

            <Pagination data={d} onPage={(p) => setFilters((f) => ({ ...f, page: p }))} />

            {loanModal && <LoanModal loan={loanModal.loan} onClose={() => setLoanModal(null)}
                onSaved={() => { setLoanModal(null); load(); }} />}
            {repayLoan && <RepaymentModal loan={repayLoan} onClose={() => setRepayLoan(null)}
                onSaved={() => { setRepayLoan(null); load(); }} />}
        </div>
    );
}
