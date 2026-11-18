import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { Btn } from "../ui";
import { localToday as today } from "../utils";

const ACCENTS = ["!border-t-brand-600", "!border-t-emerald-500", "!border-t-amber-400", "!border-t-sky-500", "!border-t-rose-400", "!border-t-violet-500", "!border-t-teal-500", "!border-t-orange-400"];

function LineChart({ labels, series }) {
    const W = 640, H = 220, P = 30;
    const max = Math.max(1, ...series.flatMap((s) => s.data));
    const px = (i) => P + (i * (W - 2 * P)) / Math.max(1, labels.length - 1);
    const py = (v) => H - P - (v / max) * (H - 2 * P);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {labels.map((l, i) => (
                <text key={i} x={px(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="#9ca3af">{l.slice(5)}</text>
            ))}
            {series.map((s, si) => (
                <polyline key={si} fill="none" stroke={s.color} strokeWidth="2.5"
                    points={s.data.map((v, i) => `${px(i)},${py(v)}`).join(" ")} />
            ))}
        </svg>
    );
}

export default function Dashboard() {
    const [from, setFrom] = useState(today());
    const [to, setTo] = useState(today());
    const [d, setD] = useState(null);
    const { can } = useAuth();

    useEffect(() => {
        api.get("/admin/dashboard", { params: { from, to } }).then((r) => setD(r.data));
    }, [from, to]);

    if (!d) return null;

    const boxes = [
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
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold text-slate-800">Dashboard</h2>
                <div className="flex items-center gap-2">
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-xl px-3 py-2 text-sm" />
                    <span className="text-slate-400">→</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-xl px-3 py-2 text-sm" />
                    <Btn onClick={() => { setFrom(today()); setTo(today()); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">Today</Btn>
                    {can("daily-close") && (
                        <Link to="/daily-close" className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition bg-brand-600 hover:bg-brand-700 text-white">Daily Close</Link>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {boxes.map(([label, val], i) => (
                    <div key={label}
                        className={"bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4 " + ACCENTS[i % ACCENTS.length]}>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-xl font-extrabold text-slate-800 mt-1">{val}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-6 mb-4 text-sm">
                    <h3 className="font-bold text-slate-700">Orders & Revenue</h3>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-brand-500" /> Orders</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500" /> Revenue</span>
                </div>
                <LineChart labels={d.chart.labels}
                    series={[
                        { data: d.chart.orders, color: "#ef4444" },
                        { data: d.chart.revenue, color: "#3b82f6" },
                    ]} />
            </div>
        </div>
    );
}
