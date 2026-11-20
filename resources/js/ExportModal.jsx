import { useState } from "react";
import { Btn, DatePicker, Field, Ico } from "./ui";
import handleExport from "./utils";

/* local YYYY-MM-DD (toISOString would shift the day in UTC+ timezones) */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const presets = () => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const daysAgo = (n) => new Date(y, m, now.getDate() - n);
    return [
        { label: "Today", from: now, to: now },
        { label: "Last 7 days", from: daysAgo(6), to: now },
        { label: "This month", from: new Date(y, m, 1), to: now },
        { label: "Last month", from: new Date(y, m - 1, 1), to: new Date(y, m, 0) },
    ].map((p) => ({ ...p, from: ymd(p.from), to: ymd(p.to) }));
};

/**
 * Date-range export modal, same look as the import modal.
 * `url` is the export endpoint without the range, e.g. "/api/admin/products?export=csv".
 */
export default function ExportModal({ title, name, url, onClose }) {
    const today = ymd(new Date());
    const [from, setFrom] = useState(ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const [to, setTo] = useState(today);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const run = async () => {
        if (!from || !to) return setError("Choose both a start date and an end date.");
        if (from > to) return setError("The start date must be on or before the end date.");
        setBusy(true); setError("");
        try {
            const sep = url.includes("?") ? "&" : "?";
            await handleExport(name, `${url}${sep}from=${from}&to=${to}`);
            onClose();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                <h3 className="font-bold text-lg mb-1">Export {title}</h3>
                <p className="text-sm text-slate-500 mb-4">Records created between these dates (both days included) will be downloaded as a CSV file.</p>

                <div className="flex flex-wrap gap-2 mb-4">
                    {presets().map((p) => (
                        <button key={p.label} type="button" onClick={() => { setFrom(p.from); setTo(p.to); setError(""); }}
                            className={"px-3 py-1.5 rounded-lg text-xs font-semibold border " +
                                (from === p.from && to === p.to ? "bg-brand-50 border-brand-500 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                            {p.label}
                        </button>
                    ))}
                </div>

                <Field label="Date range" required>
                    <DatePicker range value={{ from, to }} max={today}
                        onChange={(r) => { setFrom(r.from); setTo(r.to); setError(""); }} />
                </Field>

                {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
                )}

                <div className="flex justify-end gap-2 mt-5">
                    <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
                    <Btn onClick={run} disabled={busy} className="bg-brand-600 text-white disabled:opacity-50">
                        <Ico n="download" /> {busy ? "Exporting…" : "Export"}
                    </Btn>
                </div>
            </div>
        </div>
    );
}
