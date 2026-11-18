import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

export function Spinner() {
    return <div className="flex justify-center py-20 text-slate-400">Loading…</div>;
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

/** Centered modal card with a title, close button, body and optional footer (for small forms). */
export function Modal({ title, onClose, children, footer, className = "max-w-md" }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
            <div className={"relative bg-white rounded-2xl shadow-2xl w-full p-6 " + className}>
                <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-slate-800">{title}</h3>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                {children}
                {footer && <div className="flex justify-end gap-2 mt-6">{footer}</div>}
            </div>
        </div>
    );
}
