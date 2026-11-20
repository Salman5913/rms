import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { Btn, DatePicker, Spinner } from "../ui";
import { localToday as today } from "../utils";

const ACCENTS = ["!border-t-brand-600", "!border-t-emerald-500", "!border-t-amber-400", "!border-t-sky-500", "!border-t-rose-400", "!border-t-violet-500", "!border-t-teal-500", "!border-t-orange-400"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function LineChart({ labels, series }) {
    const W = 640, H = 220, P = 30;
    // each series has its own scale (orders are counts, revenue is rupees), so both stay readable
    const maxes = series.map((s) => Math.max(1, ...s.data));
    const px = (i) => P + (i * (W - 2 * P)) / Math.max(1, labels.length - 1);
    const py = (v, max) => H - P - (v / max) * (H - 2 * P);
    // at most ~10 date labels so long ranges don't overlap; "2026-09-11" -> "11 Sep"
    const step = Math.max(1, Math.ceil(labels.length / 10));
    const dayLabel = (l) => {
        const [, m, day] = l.split("-");
        return `${Number(day)} ${MONTHS[Number(m) - 1]}`;
    };
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {labels.map((l, i) => i % step === 0 && (
                <text key={i} x={px(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="#9ca3af">{dayLabel(l)}</text>
            ))}
            {/* top value of each scale: first series on the left, second on the right */}
            {series.slice(0, 2).map((s, si) => (
                <text key={"max" + si} x={si ? W - P : P} y={P - 12} fontSize="9" fontWeight="600"
                    textAnchor={si ? "end" : "start"} fill={s.color}>{s.format(maxes[si])}</text>
            ))}
            {/* drawn last-to-first so the first series (orders) stays on top where the lines meet */}
            {[...series].reverse().map((s) => {
                const max = maxes[series.indexOf(s)];
                return (
                    <polyline key={s.color} fill="none" stroke={s.color} strokeWidth="2.5"
                        points={s.data.map((v, i) => `${px(i)},${py(v, max)}`).join(" ")} />
                );
            })}
        </svg>
    );
}

export default function Dashboard() {
    const [from, setFrom] = useState(today());
    const [to, setTo] = useState(today());
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [vendorTotals, setVendorTotals] = useState(null);
    const { can } = useAuth();
    const showVendors = can("vendors");
    const [loanTotals, setLoanTotals] = useState(null);
    const [staffTotals, setStaffTotals] = useState(null);
    const showLoans = can("loans");
    const showStaff = can("employee-payments");

    // a new date range clears the old figures so the loader shows (like Daily Close)
    useEffect(() => {
        setD(null);
        api.get("/admin/dashboard", { params: { from, to } })
            .then((r) => { setD(r.data); setError(""); })
            .catch((err) => setError(err.response?.data?.message ?? "The dashboard could not be loaded."));
    }, [from, to]);

    // current loan balances (not tied to the date range, like vendor balances); the loans list returns the totals
    useEffect(() => {
        if (showLoans) api.get("/admin/loans").then((r) => setLoanTotals(r.data.totals)).catch(() => {});
    }, [showLoans]);

    // staff payments in the selected date range; the payroll list returns the range totals
    useEffect(() => {
        if (showStaff) api.get("/admin/employee-payments", { params: { from, to } }).then((r) => setStaffTotals(r.data.totals)).catch(() => {});
    }, [showStaff, from, to]);

    // current vendor balances (not tied to the date range); the vendors list returns the grand totals
    useEffect(() => {
        if (showVendors) api.get("/admin/vendors", { params: { per_page: 1 } }).then((r) => setVendorTotals(r.data.totals)).catch(() => {});
    }, [showVendors]);

    if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;

    // indicator groups, each shown under its own heading; a group without data (or permission) is hidden
    const groups = [
        ["Sales", [
            ["Total Sales", `Rs. ${d.total_sales.toLocaleString()}`],
            ["Total Orders", d.total_orders],
            ["Website Orders", d.website_orders],
            ["Pickup Orders", d.pickup_orders],
            ["Dine-In Orders", d.dinein_orders],
            ["Home Delivery Orders", d.delivery_orders],
            ["Website Sales", `Rs. ${d.website_sales.toLocaleString()}`],
            ["Pickup Sales", `Rs. ${d.pickup_sales.toLocaleString()}`],
            ["Dine-In Sales", `Rs. ${d.dinein_sales.toLocaleString()}`],
            ["Home Delivery Sales", `Rs. ${d.delivery_sales.toLocaleString()}`],
            ["Delivery Charges", `Rs. ${d.delivery_charges.toLocaleString()}`],
        ]],
        ["Salaries & Advances", showStaff && staffTotals ? [
            ["Total Paid to Staff", `Rs. ${staffTotals.total_paid.toLocaleString()}`],
            ["Advances Paid to Staff", `Rs. ${staffTotals.advances_given.toLocaleString()}`],
            ["Net Salaries Paid", `Rs. ${staffTotals.net_salaries.toLocaleString()}`],
            ["Advances Deducted", `Rs. ${staffTotals.advances_deducted.toLocaleString()}`],
        ] : []],
        ["Loans", showLoans && loanTotals ? [
            ["Total Borrowed Loan", `Rs. ${loanTotals.borrowed.toLocaleString()}`],
            ["Total Loan Repaid", <span className="text-emerald-600">Rs. {loanTotals.repaid.toLocaleString()}</span>],
            ["Total Remaining Loan", <span className="text-red-600">Rs. {loanTotals.remaining.toLocaleString()}</span>],
        ] : []],
        ["Vendors", showVendors && vendorTotals ? [
            ["Vendors Total Balance", <span className="text-red-600">Rs. {vendorTotals.total_owed.toLocaleString()}</span>],
            ["Advance Paid to Vendors", <span className="text-emerald-600">Rs. {vendorTotals.total_advance.toLocaleString()}</span>],
        ] : []],
    ].filter(([, boxes]) => boxes.length);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold text-slate-800">Dashboard</h2>
                <div className="flex items-center gap-2">
                    <DatePicker range value={{ from, to }} onChange={(r) => { setFrom(r.from); setTo(r.to); }} className="w-72" />
                    <Btn onClick={() => { setFrom(today()); setTo(today()); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">Today</Btn>
                    {can("daily-close") && (
                        <Link to="/daily-close" className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition bg-brand-600 hover:bg-brand-700 text-white">Daily Close</Link>
                    )}
                </div>
            </div>

            {groups.map(([heading, boxes]) => (
                <section key={heading}>
                    <h3 className="text-sm font-bold text-slate-700 mb-3">{heading}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                        {boxes.map(([label, val], i) => (
                            <div key={label}
                                className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + ACCENTS[i % ACCENTS.length]}>
                                <p className="text-xs text-slate-400 font-medium">{label}</p>
                                <p className="text-xl font-extrabold text-slate-800 mt-1">{val}</p>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-6 mb-4 text-sm">
                    <h3 className="font-bold text-slate-700">Orders & Revenue</h3>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-400" /> Orders</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500" /> Revenue</span>
                </div>
                <LineChart labels={d.chart.labels}
                    series={[
                        { data: d.chart.orders, color: "#f3c610", format: (v) => `${v.toLocaleString()} orders` },
                        { data: d.chart.revenue, color: "#3b82f6", format: (v) => `Rs. ${Math.round(v).toLocaleString()}` },
                    ]} />
            </div>
        </div>
    );
}
