import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* Drop-in replacement for window.alert / window.confirm.
   const dialog = useDialog();
   await dialog.alert("Message", { title, variant })      -> resolves when closed
   if (await dialog.confirm("Message", { ... })) { ... }   -> resolves true / false */

const DialogContext = createContext(null);

const ICONS = {
    danger: (
        <path d="M14.74 9l-.35 9m-4.78 0L9.26 9m9.97-3.21c.34.05.68.11 1.02.17m-1.02-.17L18.16 19.67a2.25 2.25 0 01-2.24 2.08H8.08a2.25 2.25 0 01-2.24-2.08L4.77 5.79m14.46 0a48.1 48.1 0 00-3.48-.4m-12 .57c.34-.06.68-.12 1.02-.17m0 0a48.1 48.1 0 013.48-.4m7.5 0v-.92c0-1.18-.91-2.16-2.09-2.2a51.96 51.96 0 00-3.32 0c-1.18.04-2.09 1.02-2.09 2.2v.92m7.5 0a48.67 48.67 0 00-7.5 0" />
    ),
    warning: (
        <path d="M12 9v3.75m-9.3 3.38c-.87 1.5.22 3.37 1.95 3.37h14.7c1.73 0 2.82-1.87 1.95-3.37L13.95 3.38c-.87-1.5-3.03-1.5-3.9 0L2.7 16.13zM12 15.75h.01" />
    ),
    info: (
        <path d="M11.25 11.25l.04-.02a.75.75 0 011.06.85l-.71 2.84a.75.75 0 001.06.85l.04-.02M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.01" />
    ),
    success: <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
};

const TONE = {
    danger: { ring: "bg-red-50 text-red-600", btn: "bg-red-600 hover:bg-red-700" },
    warning: { ring: "bg-amber-50 text-amber-600", btn: "bg-amber-500 hover:bg-amber-600" },
    info: { ring: "bg-brand-50 text-brand-600", btn: "bg-brand-600 hover:bg-brand-700" },
    success: { ring: "bg-emerald-50 text-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-700" },
};

export function DialogProvider({ children }) {
    const [dlg, setDlg] = useState(null);
    const resolver = useRef(null);

    const open = useCallback((cfg) => new Promise((resolve) => {
        // if another dialog is open, dismiss it first
        if (resolver.current) resolver.current(false);
        resolver.current = resolve;
        setDlg(cfg);
    }), []);

    const close = (result) => {
        const r = resolver.current;
        resolver.current = null;
        setDlg(null);
        if (r) r(result);
    };

    const api = useRef({
        alert: (message, opts = {}) =>
            open({ kind: "alert", message, variant: "info", title: "Notice", okText: "OK", ...opts }).then(() => undefined),
        confirm: (message, opts = {}) =>
            open({ kind: "confirm", message, variant: "danger", title: "Are you sure?", okText: "Confirm", cancelText: "Cancel", ...opts }),
    }).current;

    useEffect(() => {
        if (!dlg) return;
        const onKey = (e) => {
            if (e.key === "Escape") close(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [dlg]); // eslint-disable-line

    const tone = TONE[dlg?.variant] ?? TONE.info;

    return (
        <DialogContext.Provider value={api}>
            {children}
            {dlg && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => close(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex gap-4">
                            <div className={"w-11 h-11 rounded-full flex items-center justify-center flex-none " + tone.ring}>
                                <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.6"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    {ICONS[dlg.variant] ?? ICONS.info}
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-slate-800">{dlg.title}</h3>
                                <p className="text-sm text-slate-500 mt-1 break-words">{dlg.message}</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            {dlg.kind === "confirm" && (
                                <button onClick={() => close(false)}
                                    className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                                    {dlg.cancelText}
                                </button>
                            )}
                            <button autoFocus onClick={() => close(true)}
                                className={"text-sm font-semibold px-4 py-2 rounded-xl text-white transition " + tone.btn}>
                                {dlg.okText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}

export const useDialog = () => useContext(DialogContext);
