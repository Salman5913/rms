import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "./api";
import { Btn, Ico, Field, ImageUpload, MultiSelect, Select, Spinner, inputCls } from "./ui";
import ExportModal from "./ExportModal";
import { useDialog } from "./Dialog";
import { RequirePermission, useAuth } from "./auth";

/** "admin/stock-items" -> "stock-items" (CRUD endpoints are named after their permission module) */
const moduleOf = (endpoint) => endpoint.replace(/^admin\//, "");

/* ================= generic listing page ================= */
export function CrudPage(props) {
    const module = props.module ?? moduleOf(props.endpoint);
    return (
        <RequirePermission module={module} action="view">
            <CrudPageInner {...props} module={module} />
        </RequirePermission>
    );
}

function CrudPageInner({ title, endpoint, module, columns, searchPlaceholder = "Search…", canCreate = true, canImport = true, canExport = true, extraActions }) {
    const { can } = useAuth();
    const allowCreate = canCreate && can(module, "create");
    const allowEdit = can(module, "edit");
    const allowDelete = can(module, "delete");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState([]);
    const [importOpen, setImportOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const nav = useNavigate();
    const dialog = useDialog();

    const load = (p = page, s = search) =>
        api.get(`/${endpoint}`, { params: { page: p, search: s } }).then((r) => setData(r.data));

    useEffect(() => { load(1); }, [endpoint]); // eslint-disable-line
    useEffect(() => { const t = setTimeout(() => load(1, search), 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line

    const toggleAll = (e) => setSelected(e.target.checked ? data.data.map((r) => r.id) : []);
    const toggleOne = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    const bulkDelete = async () => {
        if (!selected.length || !(await dialog.confirm(`Delete ${selected.length} record(s)? This can't be undone.`, { title: "Delete records", okText: "Delete" }))) return;
        await api.post(`/${endpoint}-bulk-delete`, { ids: selected });
        setSelected([]); load(1);
    };

    const destroy = async (id) => {
        if (!(await dialog.confirm("This record will be permanently deleted. This can't be undone.", { title: "Delete this record?", okText: "Delete" }))) return;
        await api.delete(`/${endpoint}/${id}`); load();
    };

    // const doExport = () => { window.open(`/api/${endpoint}?export=csv`, "_blank"); };

    const rows = data?.data ?? [];
    const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
                <div className="flex gap-2">
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder={searchPlaceholder} className={inputCls + " !w-64"} />
                    {canImport && allowCreate && <Btn onClick={() => setImportOpen(true)} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"><Ico n="upload" /> Import</Btn>}
                    {canExport && <Btn onClick={() => setExportOpen(true)} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"><Ico n="download" /> Export</Btn>}
                    {allowDelete && <Btn onClick={bulkDelete} disabled={!selected.length}
                        className="bg-red-50 text-red-600 border border-red-200 disabled:opacity-40"><Ico n="trash" /> Trash ({selected.length})</Btn>}
                    {allowCreate && <Btn onClick={() => nav("create")} className="bg-brand-600 text-white hover:bg-brand-700"><Ico n="plus" /> Create</Btn>}
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-500 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide">
                            <th className="p-3 w-10"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-brand-600" /></th>
                            {columns.map((c) => <th key={c.key} className="p-3 font-semibold">{c.label}</th>)}
                            <th className="p-3 w-28 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id} className={"border-b border-slate-100 last:border-0 hover:bg-slate-50/70 " + (selected.includes(row.id) ? "bg-red-50/40" : "")}>
                                <td className="p-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleOne(row.id)} className="accent-brand-600" /></td>
                                {columns.map((c) => (
                                    <td key={c.key} className="p-3">
                                        {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                                    </td>
                                ))}
                                <td className="p-3">
                                    <div className="flex justify-end gap-1.5">
                                        <Link to={`${row.id}`} title="View" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center"><Ico n="eye" /></Link>
                                        {allowEdit && <Link to={`${row.id}/edit`} title="Edit" className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 flex items-center justify-center"><Ico n="edit" /></Link>}
                                        {allowDelete && <button onClick={() => destroy(row.id)} title="Delete" className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center"><Ico n="trash" /></button>}
                                        {extraActions?.(row)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={columns.length + 2} className="p-10 text-center text-slate-300">No records found</td></tr>}
                    </tbody>
                </table>
            </div>

            {data && data.last_page > 1 && (
                <div className="flex gap-2 mt-4 justify-center">
                    {Array.from({ length: data.last_page }, (_, i) => i + 1).map((p) => (
                        <button key={p} onClick={() => { setPage(p); load(p); }}
                            className={"w-9 h-9 rounded-lg text-sm font-semibold " + (p === data.current_page ? "bg-brand-600 text-white" : "bg-white border hover:bg-slate-50")}>
                            {p}
                        </button>
                    ))}
                </div>
            )}

            {exportOpen && <ExportModal title={title} name={title} url={`/api/${endpoint}?export=csv`}
                onClose={() => setExportOpen(false)} />}

            {importOpen && <ImportModal endpoint={endpoint} onClose={() => setImportOpen(false)}
                onDone={() => { setImportOpen(false); load(1); }} />}
        </div>
    );
}

/* ================= generic form page (create / edit / view) ================= */
export function CrudForm(props) {
    const { id } = useParams();
    const module = props.module ?? moduleOf(props.endpoint);
    const action = !id ? "create" : location.pathname.endsWith("/edit") ? "edit" : "view";
    return (
        <RequirePermission key={action} module={module} action={action}>
            <CrudFormInner {...props} />
        </RequirePermission>
    );
}

function CrudFormInner({ title, endpoint, fields, backTo }) {
    const { id } = useParams();
    const nav = useNavigate();
    const dialog = useDialog();
    const isView = location.pathname.endsWith(`/${id}`) && !location.pathname.includes("edit");
    const [values, setValues] = useState(null);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (id) {
            api.get(`/${endpoint}/${id}`).then((r) => {
                const d = r.data;
                const init = {};
                fields.forEach((f) => {
                    init[f.name] = f.many
                        ? (d[f.name]?.map((x) => x.id) ?? f.default ?? [])
                        : (d[f.name] ?? f.default ?? (f.type === "checkbox" ? false : ""));
                });
                setValues(init);
            });
        } else {
            const init = {};
            fields.forEach((f) => (init[f.name] = f.default ?? (f.type === "checkbox" ? false : f.type === "multiselect" ? [] : "")));
            setValues(init);
        }
    }, [id, endpoint]); // eslint-disable-line

    if (!values) return <Spinner />;

    const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));

    const validate = () => {
        const e = {};
        fields.forEach((f) => {
            if (f.required && (values[f.name] === "" || values[f.name] == null ||
                (Array.isArray(values[f.name]) && values[f.name].length === 0))) {
                e[f.name] = `${f.label} is required`;
            }
        });
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            const payload = { ...values };
            if (id) await api.post(`/${endpoint}/${id}`, payload);
            else await api.post(`/${endpoint}`, payload);
            nav(backTo);
        } catch (err) {
            await dialog.alert(err.response?.data?.message ?? "Validation failed — check required fields", { title: "Couldn't save", variant: "danger" });
        } finally { setSaving(false); }
    };

    const mainFields = fields.filter((f) => f.type !== "checkbox");
    const checkFields = fields.filter((f) => f.type === "checkbox");

    return (
        <div>
            <h2 className="text-xl font-extrabold text-slate-800 mb-5">{id ? (isView ? "View" : "Edit") : "Create"} {title}</h2>

            <div className="flex flex-col-reverse lg:flex-row gap-6 items-start">
                {/* ---------- form fields ---------- */}
                <div className="flex-1 min-w-0 w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
                    {mainFields.map((f) => (
                        <Field key={f.name} label={f.label} required={f.required}>
                            {f.render ? (
                                f.render({ value: values[f.name], onChange: (v) => set(f.name, v), disabled: isView })
                            ) : f.type === "textarea" ? (
                                <textarea rows={3} value={values[f.name]} disabled={isView}
                                    onChange={(e) => set(f.name, e.target.value)} className={inputCls} />
                            ) : f.type === "select" ? (
                                <Select value={values[f.name]} disabled={isView}
                                    onChange={(v) => set(f.name, v)} options={f.options}
                                    placeholder={`Select ${f.label.toLowerCase()}`} />
                            ) : f.type === "image" ? (
                                !isView && <ImageUpload value={values[f.name]} onChange={(v) => set(f.name, v)} />
                            ) : f.type === "multiselect" ? (
                                !isView ? <MultiSelect endpoint={f.endpoint} value={values[f.name]}
                                    onChange={(v) => set(f.name, v)} placeholder={f.label} />
                                    : <p className="text-sm text-slate-500">{(values[f.name] ?? []).join(", ")}</p>
                            ) : (
                                <input type={f.type ?? "text"} value={values[f.name]} disabled={isView}
                                    onChange={(e) => set(f.name, f.type === "number" ? e.target.value : e.target.value)}
                                    className={inputCls} />
                            )}
                            {errors[f.name] && <p className="text-xs text-red-500 mt-1">{errors[f.name]}</p>}
                        </Field>
                    ))}
                </div>

                {/* ---------- actions card ---------- */}
                <aside className="w-full lg:w-80 flex-none lg:sticky lg:top-24 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
                    {!isView && (
                        <Btn onClick={save} disabled={saving}
                            className="w-full justify-center py-3 bg-[#161B2E] border border-[#161B2E] text-white hover:bg-[#232a44] hover:border-[#232a44] disabled:opacity-50">
                            {saving ? "Saving…" : "Save"}
                        </Btn>
                    )}
                    <Btn onClick={() => nav(backTo)}
                        className="w-full justify-center py-3 bg-transparent border border-[#161B2E] text-[#161B2E] hover:bg-slate-100">
                        ← Back
                    </Btn>

                    {checkFields.length > 0 && (
                        <div className="pt-3 flex flex-wrap gap-x-5 gap-y-3">
                            {checkFields.map((f) => (
                                <label key={f.name} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input type="checkbox" checked={!!values[f.name]} disabled={isView}
                                        onChange={(e) => set(f.name, e.target.checked)}
                                        className="w-5 h-5 rounded accent-brand-600" />
                                    {f.label}
                                </label>
                            ))}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

/* ================= import modal (sample download + CSV / Excel file upload) ================= */
function ImportModal({ endpoint, onClose, onDone }) {
    const module = endpoint.replace(/^admin\//, "");
    const [file, setFile] = useState(null);
    const [drag, setDrag] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState(null);
    const dialog = useDialog();

    const pick = (f) => {
        setErrors(null);
        if (!f) return setFile(null);
        if (!/\.(csv|txt|xlsx)$/i.test(f.name)) {
            setFile(null);
            return setErrors({ file: ["Upload a .csv or .xlsx file."] });
        }
        setFile(f);
    };

    const downloadSample = async () => {
        const r = await api.get(`/admin/import/${module}/sample`, { responseType: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(r.data);
        a.download = `${module}-sample.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const runImport = async () => {
        if (!file) return setErrors({ file: ["Choose a file to import."] });
        const form = new FormData();
        form.append("file", file);
        setBusy(true); setErrors(null);
        try {
            const r = await api.post(`/admin/import/${module}`, form);
            // close the upload modal first, then show only the success dialog
            onDone();
            dialog.alert(`${r.data.created} created, ${r.data.updated} updated.`, { title: "Import complete", variant: "success" });
        } catch (err) {
            setBusy(false);
            if (err.response?.status === 422) setErrors(err.response.data.errors ?? { file: [err.response.data.message] });
            else setErrors({ file: [err.response?.data?.message ?? "Import failed. Please try again."] });
        }
    };

    const errorEntries = errors ? Object.entries(errors) : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                <h3 className="font-bold text-lg mb-1 capitalize">Import {module.replace("-", " ")}</h3>
                <p className="text-sm text-slate-500 mb-3">Upload a CSV or Excel (.xlsx) file. The first row must contain the column names. Rows whose name already exists update that record; blank cells keep the current value.</p>
                <button onClick={downloadSample} className="text-sm text-brand-600 font-semibold underline mb-4">
                    <Ico n="download" className="w-4 h-4 inline" /> Download sample file
                </button>

                <label
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                    className={"flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-8 cursor-pointer text-center transition " +
                        (drag ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:bg-slate-50")}>
                    <Ico n="upload" className="w-8 h-8 text-slate-400" />
                    {file ? (
                        <span className="text-sm font-semibold text-slate-700 break-all">{file.name} <span className="font-normal text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span></span>
                    ) : (
                        <span className="text-sm text-slate-500"><span className="font-semibold text-brand-600">Click to choose</span> or drag a file here</span>
                    )}
                    <span className="text-xs text-slate-400">.csv or .xlsx, up to 10 MB</span>
                    <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                </label>

                {errorEntries.length > 0 && (
                    <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 space-y-1">
                        <p className="font-semibold">Nothing was imported. Fix these and upload again:</p>
                        {errorEntries.map(([key, msgs]) => (
                            <div key={key}>
                                {key.startsWith("row_") && <span className="font-semibold">Line {key.slice(4)}: </span>}
                                {msgs.join(" ")}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                    <Btn onClick={onClose} className="bg-slate-100">Cancel</Btn>
                    <Btn onClick={runImport} disabled={busy || !file} className="bg-brand-600 text-white disabled:opacity-50">
                        {busy ? "Importing…" : "Import"}
                    </Btn>
                </div>
            </div>
        </div>
    );
}
