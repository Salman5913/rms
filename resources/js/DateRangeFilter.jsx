import { DatePicker } from "./ui";
import { localToday } from "./utils";

/* quick report ranges, resolved to dates on the server (DateRangeHelper, week starts Monday) */
export const RANGES = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "this_week", label: "This Week" },
    { value: "this_month", label: "This Month" },
    { value: "this_year", label: "This Year" },
    { value: "all", label: "All" },
];

/** "2026-11-18" -> "18 Nov 2026" */
export const fmtDate = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** the server's resolved { from, to } as text ("All dates", "18 Nov 2026", "1 Nov 2026 – 18 Nov 2026") */
export const rangeLabel = (range) => {
    if (!range?.from && !range?.to) return "All dates";
    if (range.from === range.to) return fmtDate(range.from);
    return `${range.from ? fmtDate(range.from) : "Beginning"} – ${range.to ? fmtDate(range.to) : "Today"}`;
};

export const filterBtn = (active) => "px-3 py-1.5 rounded-lg text-xs font-semibold border " +
    (active ? "bg-brand-50 border-brand-500 text-brand-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50");

/**
 * Quick range buttons + Custom (date range picker) + the resolved range as text.
 * range: preset key or "custom"; from / to: the custom dates; resolved: the server's { from, to }.
 * onChange(changes) gets { range, from, to } to merge into the page's filters.
 * Renders inline items only, so the page decides the surrounding card and what sits next to it.
 */
export default function DateRangeFilter({ range, from, to, resolved, onChange }) {
    const pickCustom = () => onChange({
        range: "custom",
        // start from the dates currently shown (or this month)
        from: resolved?.from ?? localToday().slice(0, 8) + "01",
        to: resolved?.to ?? localToday(),
    });

    return (
        <>
            {RANGES.map((r) => (
                <button key={r.value} type="button" onClick={() => onChange({ range: r.value, from: "", to: "" })}
                    className={filterBtn(range === r.value)}>{r.label}</button>
            ))}
            <button type="button" onClick={pickCustom} className={filterBtn(range === "custom")}>Custom</button>
            {range === "custom" && (
                <DatePicker range size="sm" value={{ from, to }} max={localToday()}
                    onChange={(r) => onChange({ from: r.from, to: r.to })} className="w-60" />
            )}
            <span className="text-xs text-slate-400 ml-1">{rangeLabel(resolved)}</span>
        </>
    );
}
