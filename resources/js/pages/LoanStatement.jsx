import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { fmtDate } from "../DateRangeFilter";
import { useDialog } from "../Dialog";
import { Btn, Ico, Spinner } from "../ui";
import { escapeHtml as esc, printHtml } from "../utils";
import { LoanStatus, METHOD_LABEL, MODULE, RepaymentModal, errorMessage, iconBtn, money, printRepaymentReceipt, rs } from "./Loans";

/* ================= A4 statement: the loan, every repayment and what is left (same style as the vendor ledger print) ================= */
function printStatement(d) {
    const loan = d.loan;
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");

    printHtml(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Loan Statement - ${esc(loan.lender_name)}</title>
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
<h1>Loan Statement</h1>
<div class="meta">
    <div>
        <div style="font-size:14px;font-weight:bold;">${esc(loan.lender_name)}</div>
        ${loan.lender_phone ? `<div class="muted">${esc(loan.lender_phone)}</div>` : ""}
        ${loan.comment ? `<div class="muted">${esc(loan.comment)}</div>` : ""}
    </div>
    <div style="text-align:right;">
        ${line("Restaurant", d.restaurant)}
        ${line("Loan date", fmtDate(loan.loan_date))}
        ${line("Amount", `Rs. ${money(loan.amount)}`)}
        ${line("Reference", loan.reference)}
    </div>
</div>
<table>
    <thead><tr><th>Date</th><th>Method</th><th>Comment</th><th class="n">Amount</th><th class="n">Remaining after</th></tr></thead>
    <tbody>
        <tr class="strong"><td colspan="4">Loan taken on ${esc(fmtDate(loan.loan_date))}</td><td class="n">${money(loan.amount)}</td></tr>
        ${d.repayments.map((r) => `<tr>
            <td>${esc(fmtDate(r.repayment_date))}</td>
            <td>${esc(METHOD_LABEL[r.payment_method] ?? r.payment_method)}</td>
            <td>${esc(r.comment)}</td>
            <td class="n">${money(r.amount)}</td>
            <td class="n">${money(r.remaining_after)}</td>
        </tr>`).join("")}
        ${d.repayments.length === 0 ? `<tr><td colspan="5" class="muted" style="text-align:center;padding:12px;">No repayments yet</td></tr>` : ""}
        <tr class="strong"><td colspan="3">Total repaid (${d.repayments.length} repayments)</td><td class="n">${money(d.totals.repaid)}</td><td></td></tr>
        <tr class="strong"><td colspan="4">Remaining</td><td class="n">${money(d.totals.remaining)}</td></tr>
    </tbody>
</table>
<div class="footer">Loans are borrowed money and are not part of Profit & Loss. Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`);
}

/* ================= 80mm short statement for the thermal printer (same style as the vendor short ledger) ================= */
function printShortStatement(d) {
    const loan = d.loan;
    const short = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const ddmm = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "");
    const line = (label, value) => (value ? `<div><b>${esc(label)}:</b> ${esc(value)}</div>` : "");
    const row = (label, value) => `<div class="summary-row"><span>${esc(label)}</span><span class="amt">${esc(value)}</span></div>`;

    printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Loan - ${esc(loan.lender_name)}</title>
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
    <div style="font-weight:700;margin-bottom:8px;">LOAN STATEMENT</div>
</div>
<div class="meta">
    ${line("Lender", loan.lender_name)}
    ${line("Phone", loan.lender_phone)}
    ${line("Loan date", fmtDate(loan.loan_date))}
    ${line("Reference", loan.reference)}
</div>
<hr/>
<table>
    <thead><tr><th>Date</th><th>Method</th><th class="n">Paid</th><th class="n">Remaining</th></tr></thead>
    <tbody>
        <tr><td>${ddmm(loan.loan_date)}</td><td>Loan</td><td></td><td class="n b">${short(loan.amount)}</td></tr>
        ${d.repayments.map((r) => `<tr>
            <td>${ddmm(r.repayment_date)}</td>
            <td>${esc(METHOD_LABEL[r.payment_method] ?? r.payment_method)}</td>
            <td class="n">-${short(r.amount)}</td>
            <td class="n">${short(r.remaining_after)}</td>
        </tr>`).join("")}
        ${d.repayments.length === 0 ? `<tr><td colspan="4" class="center" style="padding:6px 0;">No repayments yet</td></tr>` : ""}
    </tbody>
</table>
<hr/>
${row("Loan Amount", money(d.totals.amount))}
${row(`Repaid (${d.repayments.length})`, money(d.totals.repaid))}
<div class="total-row"><span>REMAINING</span><span class="amt">${money(d.totals.remaining)}</span></div>
<div class="footer">Printed ${esc(new Date().toLocaleString("en-GB"))}</div>
</body>
</html>`);
}

/* ================= one loan with its repayments (/loans/:id) ================= */
export default function LoanStatement() {
    const { id } = useParams();
    const nav = useNavigate();
    const { can } = useAuth();
    const dialog = useDialog();
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [modal, setModal] = useState(null);   // { repayment } (repayment is undefined when adding)

    const load = () => api.get(`/admin/loans/${id}/statement`)
        .then((r) => { setD(r.data); setError(""); })
        .catch((err) => {
            if (err.response?.status === 404) return nav("/loans", { replace: true });
            setError(errorMessage(err, "The statement could not be loaded."));
        });

    useEffect(() => { load(); }, [id]); // eslint-disable-line

    const remove = async (r) => {
        if (!(await dialog.confirm(`This repayment of ${rs(r.amount)} on ${fmtDate(r.repayment_date)} will be permanently deleted. This can't be undone.`,
            { title: "Delete this repayment?", okText: "Delete" }))) return;
        try {
            await api.delete(`/admin/loan-repayments/${r.id}`);
            load();
        } catch (err) {
            dialog.alert(errorMessage(err, "The repayment could not be deleted."), { title: "Can't delete", variant: "warning" });
        }
    };

    if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;
    const loan = d.loan;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link to="/loans" className="text-xs font-semibold text-slate-400 hover:text-slate-600">← Loans</Link>
                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-3">
                        {loan.lender_name}
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded-full"><LoanStatus status={loan.status} /></span>
                    </h2>
                    <p className="text-sm text-slate-500">
                        {[loan.lender_phone, `Taken on ${fmtDate(loan.loan_date)}`, loan.reference && `Ref: ${loan.reference}`].filter(Boolean).join(" · ")}
                    </p>
                    {loan.comment && <p className="text-sm text-slate-500 mt-1">{loan.comment}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Btn onClick={() => printShortStatement(d)} title="Print a short 80mm receipt of this statement"
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Ico n="print" /> Print Short Receipt
                    </Btn>
                    <Btn onClick={() => printStatement(d)} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Ico n="print" /> Print statement
                    </Btn>
                    {can(MODULE, "create") && (
                        <Btn onClick={() => setModal({})} disabled={loan.status !== "active"}
                            title={loan.status !== "active" ? "This loan is fully repaid" : undefined}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                            <Ico n="plus" /> Add repayment
                        </Btn>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    ["Loan amount", d.totals.amount, "!border-t-brand-500"],
                    ["Repaid", d.totals.repaid, "!border-t-emerald-500"],
                    ["Remaining", d.totals.remaining, "!border-t-red-500"],
                ].map(([label, val, accent]) => (
                    <div key={label} className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + accent}>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-xl font-extrabold text-slate-800 mt-1">{rs(val)}</p>
                    </div>
                ))}
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 font-semibold">Date</th>
                            <th className="p-3 font-semibold text-right">Amount</th>
                            <th className="p-3 font-semibold">Method</th>
                            <th className="p-3 font-semibold">Comment</th>
                            <th className="p-3 font-semibold text-right">Remaining after</th>
                            <th className="p-3 w-32" />
                        </tr>
                    </thead>
                    <tbody>
                        {d.repayments.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                                <td className="p-3 whitespace-nowrap text-slate-700">{fmtDate(r.repayment_date)}</td>
                                <td className="p-3 text-right whitespace-nowrap font-semibold text-emerald-700">{rs(r.amount)}</td>
                                <td className="p-3 text-slate-600">{METHOD_LABEL[r.payment_method] ?? r.payment_method}</td>
                                <td className="p-3 text-slate-600 max-w-xs break-words">{r.comment || "—"}</td>
                                <td className="p-3 text-right whitespace-nowrap">{rs(r.remaining_after)}</td>
                                <td className="p-3">
                                    <div className="flex justify-end items-center gap-1.5">
                                        <button onClick={() => printRepaymentReceipt(loan.id, r.id, dialog)} title="Print receipt"
                                            className={iconBtn + "bg-slate-100 text-slate-600 hover:bg-slate-200"}><Ico n="print" /></button>
                                        {can(MODULE, "edit") && (
                                            <button onClick={() => setModal({ repayment: r })} title="Edit"
                                                className={iconBtn + "bg-brand-50 text-brand-600 hover:bg-brand-100"}><Ico n="edit" /></button>
                                        )}
                                        {can(MODULE, "delete") && (
                                            <button onClick={() => remove(r)} title="Delete"
                                                className={iconBtn + "bg-red-50 hover:bg-red-100"}><Ico n="trash" /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {d.repayments.length === 0 && (
                            <tr><td colSpan={6} className="p-10 text-center text-slate-300">No repayments yet</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {modal && <RepaymentModal loan={loan} repayment={modal.repayment} onClose={() => setModal(null)}
                onSaved={() => { setModal(null); load(); }} />}
        </div>
    );
}
