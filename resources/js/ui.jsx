import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { onRequestsChange, requestsInFlight } from "./api";

export const inputCls =
    "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white";

export function Field({ label, required, children }) {
    return (
        <label className="block">
            <span className="text-sm font-medium text-gray-600">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            <div className="mt-1">{children}</div>
        </label>
    );
}

export function ImageUpload({ value, onChange }) {
    const [uploading, setUploading] = useState(false);
    const pick = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        setUploading(true);
        try {
            const r = await api.post("/upload", fd);
            onChange(r.data.url);
        } finally { setUploading(false); }
    };
    return (
        <div>
            {value && <img src={value} alt="" className="h-28 rounded-xl object-cover mb-2 border" />}
            <input type="file" accept="image/*" onChange={pick} className="text-sm" />
            {uploading && <p className="text-xs text-gray-400 mt-1">Uploading…</p>}
        </div>
    );
}

import api from "./api";

export function MultiSelect({ endpoint, value = [], onChange, placeholder = "Select…" }) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState([]);
    const ref = useRef();

    useEffect(() => {
        api.get(endpoint).then((r) => setOptions(r.data));
    }, [endpoint]);

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const toggle = (id) =>
        onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

    const label = (id) => options.find((o) => o.id === id)?.name ?? id;

    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen(!open)}
                className={inputCls + " flex flex-wrap gap-1 text-left min-h-[42px]"}>
                {value.length === 0 && <span className="text-gray-400">{placeholder}</span>}
                {value.map((id) => (
                    <span key={id} className="bg-brand-50 text-brand-700 text-xs font-semibold px-2 py-1 rounded-full">
                        {label(id)}
                        <span className="ml-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggle(id); }}>✕</span>
                    </span>
                ))}
                <span className="ml-auto text-gray-400">▾</span>
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {options.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)}
                                className="accent-brand-600" />
                            {o.name}
                            {o.price !== undefined && o.price > 0 && <span className="text-gray-400 text-xs">(+{o.price})</span>}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Searchable single-select dropdown.
 * options: [{ value, label }]. onChange receives the option's original value ("" when cleared).
 * The menu is portalled to <body> so it is never clipped by tables/cards and doesn't
 * trigger the parent <label> (Field) when clicked.
 */
export function Select({
    value,
    onChange,
    options = [],
    placeholder = "Select",
    disabled = false,
    searchable = true,
    clearable = true,
    size = "md",
    className = "",
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState(null);
    const triggerRef = useRef();
    const menuRef = useRef();
    const searchRef = useRef();
    const listRef = useRef();

    const selected = options.find((o) => String(o.value) === String(value ?? ""));
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;

    const place = () => {
        const r = triggerRef.current?.getBoundingClientRect();
        if (!r) return;
        const below = window.innerHeight - r.bottom;
        const up = below < 280 && r.top > below;
        setPos({ left: r.left, width: Math.max(r.width, 180), top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined });
    };

    const openMenu = () => {
        if (disabled) return;
        place();
        setQuery("");
        setActive(Math.max(0, options.indexOf(selected)));
        setOpen(true);
    };
    const close = () => { setOpen(false); triggerRef.current?.focus(); };
    const pick = (o) => { onChange?.(o ? o.value : ""); setOpen(false); triggerRef.current?.focus(); };

    useEffect(() => {
        if (!open) return;
        const outside = (e) => {
            if (!triggerRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false);
        };
        const reflow = (e) => { if (!menuRef.current?.contains(e.target)) place(); };
        document.addEventListener("mousedown", outside);
        window.addEventListener("resize", reflow);
        window.addEventListener("scroll", reflow, true);
        if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
        return () => {
            document.removeEventListener("mousedown", outside);
            window.removeEventListener("resize", reflow);
            window.removeEventListener("scroll", reflow, true);
        };
    }, [open]);

    useEffect(() => {
        listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }, [active, open]);

    const onKey = (e) => {
        if (!open) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openMenu(); }
            return;
        }
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); filtered[active] && pick(filtered[active]); }
        else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(); }
    };

    const sm = size === "sm";
    const chevron = (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className={"flex-none text-slate-500 transition-transform " + (sm ? "w-3.5 h-3.5 " : "w-4 h-4 ") + (open ? "rotate-180" : "")} aria-hidden="true">
            <path d="M5 8l5 5 5-5" />
        </svg>
    );

    return (
        <div className={"relative " + className}>
            <button
                type="button"
                ref={triggerRef}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openMenu())}
                onKeyDown={onKey}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={
                    "w-full flex items-center gap-2 text-left bg-white border transition focus:outline-none " +
                    (sm ? "rounded-lg px-2.5 py-1.5 text-xs font-semibold " : "rounded-xl px-4 py-2.5 text-sm ") +
                    (open ? "border-brand-500 ring-2 ring-brand-500/20 " : "border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-brand-500 ") +
                    (disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : "cursor-pointer")
                }
            >
                <span className={"flex-1 truncate " + (selected ? "text-slate-800" : "text-slate-400")}>
                    {selected ? selected.label : placeholder}
                </span>
                {chevron}
            </button>

            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
                    className="z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl p-1.5"
                    onKeyDown={onKey}
                >
                    {searchable && (
                        <div className="relative mb-1.5">
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
                                <circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" />
                            </svg>
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                                placeholder="Search…"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:bg-white"
                            />
                        </div>
                    )}
                    <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto space-y-0.5">
                        {filtered.length === 0 && (
                            <li className="px-3 py-2.5 text-sm text-slate-400">No results</li>
                        )}
                        {filtered.map((o, i) => {
                            const isSel = selected && String(o.value) === String(selected.value);
                            return (
                                <li
                                    key={o.value}
                                    role="option"
                                    aria-selected={isSel}
                                    onMouseEnter={() => setActive(i)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pick(o)}
                                    className={
                                        "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 " +
                                        (sm ? "text-xs " : "text-sm ") +
                                        (i === active ? "bg-slate-100 " : "") +
                                        (isSel ? "font-semibold text-slate-900" : "")
                                    }
                                >
                                    <span className="flex-1">{o.label}</span>
                                    {isSel && (
                                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                            className="w-4 h-4 text-brand-600 flex-none" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    {clearable && selected && (
                        <button type="button" onClick={() => pick(null)}
                            className="w-full mt-1 pt-2 pb-1 border-t border-slate-100 text-xs text-slate-500 hover:text-slate-700">
                            Clear selection
                        </button>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

const ICO = {
    dots: "M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
    book: "M12 6.04A8.97 8.97 0 006 3.75c-1.05 0-2.06.18-3 .51v14.25A8.99 8.99 0 016 18c2.3 0 4.4.87 6 2.29m0-14.25a8.97 8.97 0 016-2.29c1.05 0 2.06.18 3 .51v14.25A8.99 8.99 0 0018 18a8.97 8.97 0 00-6 2.29m0-14.25v14.25",
    cart: "M2.25 3h1.39c.51 0 .96.34 1.09.84l.38 1.44M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.22c1.12-2.3 2.1-4.68 2.92-7.13A60.1 60.1 0 005.27 5.27M7.5 14.25L5.1 5.27M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
    cash: "M2.25 18.75a60.07 60.07 0 0115.8 2.1c.73.2 1.45-.34 1.45-1.1v-1M3.75 4.5h16.5c.62 0 1.13.5 1.13 1.13v10.5c0 .62-.5 1.12-1.13 1.12H3.75c-.62 0-1.12-.5-1.12-1.12V5.63c0-.62.5-1.13 1.12-1.13zM15 10.88a3 3 0 11-6 0 3 3 0 016 0z",
    print: "M6.72 13.83c-.24.03-.48.06-.72.1m.72-.1a42.4 42.4 0 0110.56 0m-10.56 0L6.34 18m10.94-4.17c.24.03.48.06.72.1m-.72-.1L17.66 18m0 0l.23 2.5A1.13 1.13 0 0116.77 21.75H7.23a1.13 1.13 0 01-1.12-1.25L6.34 18m11.32 0h1.09a2.25 2.25 0 002.25-2.25V9.46c0-1.08-.77-2.01-1.83-2.2a48.4 48.4 0 00-1.17-.18M6.34 18H5.25A2.25 2.25 0 013 15.75V9.46c0-1.08.77-2.01 1.83-2.2a48.4 48.4 0 011.17-.18m10.5 0a48.5 48.5 0 00-10.5 0m10.5 0V3.38c0-.62-.5-1.13-1.13-1.13H7.88c-.62 0-1.13.5-1.13 1.13v3.7M18 10.5h.01",
    eye: "M2.04 12.32a1.01 1.01 0 010-.64C3.42 7.51 7.36 4.5 12 4.5c4.64 0 8.57 3.01 9.96 7.18.07.21.07.43 0 .64C20.58 16.49 16.64 19.5 12 19.5c-4.64 0-8.57-3.01-9.96-7.18zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
    edit: "M16.86 4.49l1.69-1.69a1.87 1.87 0 112.65 2.65L10.58 16.07a4.5 4.5 0 01-1.9 1.13L6 18l.8-2.69a4.5 4.5 0 011.13-1.9l8.93-8.92zm0 0L19.5 7.13",
    trash: "M14.74 9l-.35 9m-4.78 0L9.26 9m9.97-3.21c.34.05.68.11 1.02.17m-1.02-.17L18.16 19.67a2.25 2.25 0 01-2.24 2.08H8.08a2.25 2.25 0 01-2.24-2.08L4.77 5.79m14.46 0a48.1 48.1 0 00-3.48-.4m-12 .57c.34-.06.68-.12 1.02-.17m0 0a48.1 48.1 0 013.48-.4m7.5 0v-.92c0-1.18-.91-2.16-2.09-2.2a51.96 51.96 0 00-3.32 0c-1.18.04-2.09 1.02-2.09 2.2v.92m7.5 0a48.67 48.67 0 00-7.5 0",
    plus: "M12 4.5v15m7.5-7.5h-15",
    upload: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
    download: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3",
};

export function Ico({ n, className = "w-4 h-4" }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
            className={className + " flex-none"} aria-hidden="true">
            <path d={ICO[n]} />
        </svg>
    );
}

/** Status as coloured text for list pages: green when `on` ("Active"), grey otherwise ("Disabled"). */
export function StatusText({ on, onText = "Active", offText = "Disabled", offClass = "text-slate-400" }) {
    return <span className={"font-semibold whitespace-nowrap " + (on ? "text-emerald-600" : offClass)}>{on ? onText : offText}</span>;
}

/**
 * Loader graphic: a large slate gear and a small brand gear turning against each other, with a bar filling below.
 * Shared by Spinner and BootLoader. The gear teeth are a thick dashed circle (strokeDasharray), not drawn paths.
 */
function GearLoader() {
    return (
        <div role="status" className="flex flex-col items-center gap-2">
            <svg viewBox="0 0 100 100" className="w-24 h-24" fill="none" aria-hidden="true">
                {/* SVG elements rotate around the viewBox point given in transformOrigin, i.e. each gear's centre */}
                <g className="motion-safe:animate-spin" style={{ transformOrigin: "38px 40px", animationDuration: "2.4s" }}>
                    <circle cx="38" cy="40" r="17" strokeWidth="4" className="stroke-slate-700" />
                    <circle cx="38" cy="40" r="21" strokeWidth="6" strokeDasharray="5.5 5.5" className="stroke-slate-700" />
                    <circle cx="38" cy="40" r="6" strokeWidth="4" className="stroke-brand-500" />
                </g>
                <g className="motion-safe:animate-spin" style={{ transformOrigin: "68px 54px", animationDuration: "1.6s", animationDirection: "reverse" }}>
                    <circle cx="68" cy="54" r="9" strokeWidth="3.5" className="stroke-brand-500" />
                    <circle cx="68" cy="54" r="12" strokeWidth="5" strokeDasharray="3.9 3.9" className="stroke-brand-500" />
                    <circle cx="68" cy="54" r="3" strokeWidth="3" className="stroke-brand-500" />
                </g>
                <rect x="18" y="74" width="64" height="13" rx="6.5" strokeWidth="3.5" className="stroke-slate-700" />
                <rect x="23" y="78.5" width="54" height="4" rx="2" className="fill-brand-500 motion-safe:animate-loader-bar"
                    style={{ transformBox: "fill-box", transformOrigin: "left" }} />
            </svg>
            <span className="text-sm text-slate-400">Loading…</span>
        </div>
    );
}

/**
 * Page loader, centred in the content area (screen height minus the h-16 header and main's p-8).
 * Pass `inline` when it sits inside a card or section instead of replacing the whole page.
 */
export function Spinner({ inline = false }) {
    const size = inline ? "py-10" : "min-h-[calc(100vh-8rem)]";
    return <div className={"flex items-center justify-center " + size}><GearLoader /></div>;
}

/**
 * Tracks the list requests in flight: `const [loading, track] = useLoading(); track(api.get(...))`.
 * It counts requests, so when search typing fires several, an older one finishing doesn't hide the loader early.
 */
export function useLoading() {
    const [count, setCount] = useState(0);
    const track = (promise) => {
        setCount((c) => c + 1);
        return promise.finally(() => setCount((c) => c - 1));
    };
    return [count > 0, track];
}

/** Table body that shows the loader (one full-width row) while the list reloads, and the rows otherwise. */
export function TableBody({ loading, cols, children }) {
    return (
        <tbody>
            {loading ? <tr><td colSpan={cols}><Spinner inline /></td></tr> : children}
        </tbody>
    );
}

let booted = false;   // the boot loader is shown once per browser load (refresh), never on in-app navigation

/**
 * Full-screen loader for a browser refresh: shown while the login check runs (`waiting`), then kept over
 * the page until every request the first page started has finished, so its data appears in one go.
 * Page loaders (Spinner) underneath stay covered; after this, pages show their own Spinner as usual.
 */
export function BootLoader({ waiting = false }) {
    const [show, setShow] = useState(!booted);

    useEffect(() => {
        if (booted || waiting) return;
        let timer;
        const done = () => { booted = true; setShow(false); };
        // a short pause with nothing in flight, so a request that starts right after another one finishes still counts
        const check = () => {
            clearTimeout(timer);
            if (requestsInFlight() === 0) timer = setTimeout(() => requestsInFlight() === 0 && done(), 150);
        };
        const off = onRequestsChange(check);
        check();
        const limit = setTimeout(done, 15000);   // never block the page if a request hangs
        return () => { off(); clearTimeout(timer); clearTimeout(limit); };
    }, [waiting]);

    if (!show) return null;
    return <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center"><GearLoader /></div>;
}

export function Btn({ children, className = "", ...props }) {
    return (
        <button {...props}
            className={"inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition " + className}>
            {children}
        </button>
    );
}

/** Page buttons for a Laravel paginator response ({ current_page, last_page }). */
export function Pagination({ data, onPage }) {
    if (!data || data.last_page <= 1) return null;
    return (
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {Array.from({ length: data.last_page }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => p !== data.current_page && onPage(p)}
                    className={"w-9 h-9 rounded-lg text-sm font-semibold " + (p === data.current_page ? "bg-brand-600 text-white" : "bg-white border hover:bg-slate-50")}>
                    {p}
                </button>
            ))}
        </div>
    );
}

/**
 * Table header label with a filter icon; clicking it opens a small menu of options.
 * options: [{ value, label }]. onChange receives the picked value, or "" when cleared.
 * The menu is portalled to <body> so the table's overflow doesn't clip it.
 */
export function ColumnFilter({ label, value = "", onChange, options = [], searchable = false }) {
    const [pos, setPos] = useState(null);
    const [query, setQuery] = useState("");
    const btnRef = useRef();
    const menuRef = useRef();
    const searchRef = useRef();
    const active = value !== "" && value != null;
    const q = query.trim().toLowerCase();
    const shown = searchable && q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;

    const toggle = () => {
        if (pos) return setPos(null);
        const r = btnRef.current.getBoundingClientRect();
        const width = searchable ? 240 : 176;
        setQuery("");
        setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 8)), width });
        if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
    };
    const pick = (v) => { onChange?.(v); setPos(null); };

    useEffect(() => {
        if (!pos) return;
        const outside = (e) => { if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setPos(null); };
        const close = () => setPos(null);
        // scrolling the option list itself must not close the menu
        const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setPos(null); };
        const onKey = (e) => { if (e.key === "Escape") setPos(null); };
        document.addEventListener("mousedown", outside);
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            document.removeEventListener("mousedown", outside);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [pos]);

    return (
        <span className="inline-flex items-center gap-1">
            {label}
            <button type="button" ref={btnRef} onClick={toggle} title={`Filter ${typeof label === "string" ? label.toLowerCase() : ""}`}
                aria-haspopup="menu" aria-expanded={!!pos}
                className={"relative w-6 h-6 rounded-md flex items-center justify-center transition " +
                    (active ? "bg-brand-50 text-brand-600" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600")}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                    className="w-3.5 h-3.5" aria-hidden="true"><path d="M3 4.5h14l-5.5 6.5v4.5l-3 1.5v-6L3 4.5z" /></svg>
                {active && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-600" />}
            </button>
            {pos && createPortal(
                <div ref={menuRef} role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
                    className="z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 normal-case tracking-normal">
                    {searchable && (
                        <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
                            className="w-full mb-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:bg-white" />
                    )}
                    <div className="max-h-64 overflow-y-auto">
                    {shown.length === 0 && <p className="px-3 py-2.5 text-sm text-slate-400">No results</p>}
                    {shown.map((o) => {
                        const sel = String(o.value) === String(value);
                        return (
                            <button key={o.value} type="button" role="menuitemradio" aria-checked={sel} onClick={() => pick(o.value)}
                                className={"w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left text-slate-700 hover:bg-slate-100 " +
                                    (sel ? "font-semibold text-slate-900" : "")}>
                                <span className="flex-1">{o.label}</span>
                                {sel && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                    className="w-4 h-4 text-brand-600" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>}
                            </button>
                        );
                    })}
                    </div>
                    {active && (
                        <button type="button" onClick={() => pick("")}
                            className="w-full mt-1 pt-2 pb-1 border-t border-slate-100 text-xs text-slate-500 hover:text-slate-700">
                            Clear filter
                        </button>
                    )}
                </div>,
                document.body
            )}
        </span>
    );
}

/** Centered modal card with a title, close button, body and optional footer (for small forms). */
export function Modal({ title, onClose, children, footer, className = "max-w-md" }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
            {/* never taller than the screen: title and footer stay put, the body scrolls */}
            <div className={"relative bg-white rounded-2xl shadow-2xl w-full p-6 flex flex-col max-h-[calc(100vh-2rem)] " + className}>
                <div className="flex justify-between items-start mb-4 flex-none">
                    <h3 className="font-bold text-slate-800">{title}</h3>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                {/* -mx/px keeps focus rings from being clipped at the sides */}
                <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">{children}</div>
                {footer && <div className="flex justify-end gap-2 mt-6 flex-none">{footer}</div>}
            </div>
        </div>
    );
}

/* ---------- DatePicker ---------- */

const pad2 = (n) => String(n).padStart(2, "0");
/* local YYYY-MM-DD (toISOString would shift the day in UTC+ timezones) */
const toYmd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromYmd = (s) => {
    const [y, m, d] = String(s || "").split("-").map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
};
const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return toYmd(d); };
const addMonths = (s, n) => {
    const d = fromYmd(s), day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return toYmd(t);
};
const fmtDate = (s) => fromYmd(s)?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "";
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PICKER_W = 296;

/**
 * Calendar date picker in the app's look (use instead of <input type="date">).
 * Single: value "YYYY-MM-DD", onChange("YYYY-MM-DD" | "").
 * Range (`range`): value { from, to }, onChange({ from, to }) once both ends are picked.
 * `min` / `max` are "YYYY-MM-DD". The calendar is portalled to <body> like Select,
 * so it isn't clipped by cards/modals and doesn't trigger a parent <label> (Field).
 * Keyboard: arrows move a day/week, PageUp/PageDown a month, Enter picks, Esc closes.
 */
export function DatePicker({
    value,
    onChange,
    range = false,
    min,
    max,
    placeholder,
    clearable = false,
    disabled = false,
    size = "md",
    className = "",
}) {
    const from = (range ? value?.from : value) || "";
    const to = (range ? value?.to : "") || "";
    const today = toYmd(new Date());
    const off = (s) => (min && s < min) || (max && s > max);
    const clamp = (s) => (min && s < min ? min : max && s > max ? max : s);

    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState("days"); // days | months
    const [view, setView] = useState(today); // any date in the month shown
    const [focus, setFocus] = useState(today); // keyboard-focused day
    const [draft, setDraft] = useState(""); // range: first day picked, waiting for the second
    const [hover, setHover] = useState("");
    const [pos, setPos] = useState(null);
    const triggerRef = useRef();
    const menuRef = useRef();
    const gridRef = useRef();

    const place = () => {
        const r = triggerRef.current?.getBoundingClientRect();
        if (!r) return;
        const below = window.innerHeight - r.bottom;
        const up = below < 380 && r.top > below;
        const left = Math.max(8, Math.min(r.left, window.innerWidth - PICKER_W - 8));
        setPos({ left, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined });
    };

    const openMenu = () => {
        if (disabled) return;
        const start = clamp(from || today);
        place();
        setView(start); setFocus(start); setMode("days"); setDraft(""); setHover("");
        setOpen(true);
    };
    const close = () => { setOpen(false); setDraft(""); triggerRef.current?.focus(); };

    const pick = (s) => {
        if (off(s)) return;
        if (!range) { onChange?.(s); return close(); }
        if (!draft) { setDraft(s); setFocus(s); return; }
        const [a, b] = s < draft ? [s, draft] : [draft, s];
        onChange?.({ from: a, to: b });
        close();
    };
    const pickToday = () => {
        if (off(today)) return;
        if (range) { onChange?.({ from: today, to: today }); close(); } else pick(today);
    };
    const clear = () => { onChange?.(range ? { from: "", to: "" } : ""); close(); };

    useEffect(() => {
        if (!open) return;
        const outside = (e) => {
            if (!triggerRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) { setOpen(false); setDraft(""); }
        };
        const reflow = (e) => { if (!menuRef.current?.contains(e.target)) place(); };
        document.addEventListener("mousedown", outside);
        window.addEventListener("resize", reflow);
        window.addEventListener("scroll", reflow, true);
        return () => {
            document.removeEventListener("mousedown", outside);
            window.removeEventListener("resize", reflow);
            window.removeEventListener("scroll", reflow, true);
        };
    }, [open]);

    // keep the keyboard-focused day focused
    useEffect(() => {
        if (open && mode === "days") gridRef.current?.querySelector(`[data-day="${focus}"]`)?.focus();
    }, [open, mode, focus, view]);

    const moveFocus = (s) => {
        const t = clamp(s);
        setFocus(t);
        if (t.slice(0, 7) !== view.slice(0, 7)) setView(t);
        if (draft) setHover(t);
    };
    const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); return close(); }
        if (mode !== "days") return;
        const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (keys[e.key]) { e.preventDefault(); moveFocus(addDays(focus, keys[e.key])); }
        else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); moveFocus(addMonths(focus, e.key === "PageUp" ? -1 : 1)); }
    };

    // month grid: 6 weeks starting on Monday
    const v = fromYmd(view);
    const y = v.getFullYear(), m = v.getMonth();
    const gridStart = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
    const days = Array.from({ length: 42 }, (_, i) =>
        toYmd(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)));
    const monthStart = (yy, mm) => toYmd(new Date(yy, mm, 1));
    const monthEnd = (yy, mm) => toYmd(new Date(yy, mm + 1, 0));
    const monthOff = (yy, mm) => (min && monthEnd(yy, mm) < min) || (max && monthStart(yy, mm) > max);

    // highlighted span: the picked range, or the range being chosen (draft → hovered day)
    const [lo, hi] = draft ? [draft, hover || draft].sort() : [from, (range && to) || from];

    const shift = (n) => {
        if (mode === "months") return setView(monthStart(y + n, m));
        setView(monthStart(y, m + n));
        setFocus(clamp(addMonths(focus, n)));
    };
    const prevOff = mode === "months" ? min && `${y - 1}-12-31` < min : monthOff(y, m - 1);
    const nextOff = mode === "months" ? max && `${y + 1}-01-01` > max : monthOff(y, m + 1);

    const sm = size === "sm";
    const label = range
        ? from && to ? (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`) : ""
        : fmtDate(from);
    const arrow = (d) => (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
            <path d={d} />
        </svg>
    );
    const navBtn = "w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed";

    return (
        <div className={"relative " + className}>
            <button
                type="button"
                ref={triggerRef}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openMenu())}
                onKeyDown={(e) => { if (!open && ["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); openMenu(); } }}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={
                    "w-full flex items-center gap-2 text-left bg-white border transition focus:outline-none " +
                    (sm ? "rounded-lg px-2.5 py-1.5 text-xs font-semibold " : "rounded-xl px-4 py-2.5 text-sm ") +
                    (open ? "border-brand-500 ring-2 ring-brand-500/20 " : "border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-brand-500 ") +
                    (disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : "cursor-pointer")
                }
            >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    className={"flex-none text-slate-400 " + (sm ? "w-3.5 h-3.5" : "w-4 h-4")} aria-hidden="true">
                    <rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" />
                </svg>
                <span className={"flex-1 truncate " + (label ? "text-slate-800" : "text-slate-400")}>
                    {label || placeholder || (range ? "Select dates" : "Select date")}
                </span>
            </button>

            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    role="dialog"
                    style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: PICKER_W }}
                    className="z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl p-3 select-none"
                    onKeyDown={onKey}
                >
                    <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={() => shift(-1)} disabled={!!prevOff} className={navBtn} aria-label="Previous">{arrow("M12.5 5l-5 5 5 5")}</button>
                        <button type="button" onClick={() => setMode(mode === "days" ? "months" : "days")}
                            className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-800 hover:bg-slate-100">
                            {mode === "days" ? v.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : y}
                        </button>
                        <button type="button" onClick={() => shift(1)} disabled={!!nextOff} className={navBtn} aria-label="Next">{arrow("M7.5 5l5 5-5 5")}</button>
                    </div>

                    {mode === "months" ? (
                        <div className="grid grid-cols-3 gap-1.5 py-1">
                            {MONTHS.map((name, i) => {
                                const cur = from && from.slice(0, 7) === `${y}-${pad2(i + 1)}`;
                                return (
                                    <button key={name} type="button" disabled={!!monthOff(y, i)}
                                        onClick={() => { setView(monthStart(y, i)); setFocus(clamp(monthStart(y, i))); setMode("days"); }}
                                        className={"py-2.5 rounded-lg text-sm font-semibold disabled:text-slate-300 disabled:cursor-not-allowed " +
                                            (cur ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100 disabled:hover:bg-transparent")}>
                                        {name}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-7 mb-1">
                                {WEEKDAYS.map((w) => <span key={w} className="text-center text-[11px] font-semibold text-slate-400 py-1">{w}</span>)}
                            </div>
                            <div ref={gridRef} className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover("")}>
                                {days.map((s) => {
                                    const outside = s.slice(0, 7) !== view.slice(0, 7);
                                    const dis = off(s);
                                    const edge = lo && (s === lo || s === hi);
                                    const inside = lo && hi && s > lo && s < hi;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            data-day={s}
                                            tabIndex={s === focus ? 0 : -1}
                                            disabled={dis}
                                            aria-pressed={!!edge}
                                            aria-label={fmtDate(s)}
                                            onClick={() => pick(s)}
                                            onMouseEnter={() => draft && setHover(s)}
                                            className={
                                                "h-9 text-sm flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
                                                (edge ? "bg-brand-600 text-white font-semibold rounded-lg "
                                                    : inside ? "bg-brand-50 text-brand-700 "
                                                    : dis ? "text-slate-300 cursor-not-allowed rounded-lg "
                                                    : (outside ? "text-slate-400 " : "text-slate-700 ") + "hover:bg-slate-100 rounded-lg ") +
                                                (s === today && !edge && !inside ? "font-bold ring-1 ring-inset ring-brand-200 " : "")
                                            }
                                        >
                                            {Number(s.slice(8))}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 text-xs">
                        {range && draft
                            ? <span className="text-slate-500">Now pick the end date</span>
                            : (
                                <button type="button" disabled={!!off(today)} onClick={pickToday}
                                    className="font-semibold text-brand-600 hover:text-brand-700 disabled:text-slate-300 disabled:cursor-not-allowed">
                                    Today
                                </button>
                            )}
                        {clearable && (from || to) && (
                            <button type="button" onClick={clear} className="ml-auto text-slate-500 hover:text-slate-700">Clear</button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

/**
 * "⋯" row button that opens a small menu of secondary actions (keeps table action columns narrow).
 * items: [{ label, icon?, to? (router link) | onClick?, className? (text colour) }]; falsy items are skipped.
 * The menu is portalled to <body> like Select, so table overflow doesn't clip it.
 */
export function ActionMenu({ items = [], title = "More actions" }) {
    const list = items.filter(Boolean);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const btnRef = useRef();
    const menuRef = useRef();
    const W = 180;

    const place = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (!r) return;
        const below = window.innerHeight - r.bottom;
        const up = below < list.length * 40 + 24 && r.top > below;
        const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8));
        setPos({ left, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined });
    };

    useEffect(() => {
        if (!open) return;
        const outside = (e) => { if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false); };
        const shut = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
        document.addEventListener("mousedown", outside);
        document.addEventListener("keydown", esc);
        window.addEventListener("resize", shut);
        window.addEventListener("scroll", shut, true);
        return () => {
            document.removeEventListener("mousedown", outside);
            document.removeEventListener("keydown", esc);
            window.removeEventListener("resize", shut);
            window.removeEventListener("scroll", shut, true);
        };
    }, [open]);

    if (!list.length) return null;

    const itemCls = (it) => "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left hover:bg-slate-50 " + (it.className || "text-slate-700");

    return (
        <>
            <button type="button" ref={btnRef} title={title} aria-label={title} aria-haspopup="menu" aria-expanded={open}
                onClick={() => { if (!open) place(); setOpen(!open); }}
                className={"w-8 h-8 rounded-lg flex items-center justify-center " + (open ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                <Ico n="dots" />
            </button>
            {open && pos && createPortal(
                <div ref={menuRef} role="menu"
                    style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: W }}
                    className="z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                    {list.map((it) => {
                        const inner = <>{it.icon && <Ico n={it.icon} />}<span className="flex-1">{it.label}</span></>;
                        return it.to
                            ? <Link key={it.label} to={it.to} role="menuitem" onClick={() => setOpen(false)} className={itemCls(it)}>{inner}</Link>
                            : <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick?.(); }} className={itemCls(it)}>{inner}</button>;
                    })}
                </div>,
                document.body
            )}
        </>
    );
}
