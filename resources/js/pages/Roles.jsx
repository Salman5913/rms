import { Route, Routes } from "react-router-dom";
import { CrudPage, CrudForm } from "../Crud";
import { MODULE_GROUPS, MODULES } from "../modules";

const ACTION_COLS = ["can_view", "can_create", "can_edit", "can_delete"];
const blank = (module) => ({ module, can_view: false, can_create: false, can_edit: false, can_delete: false });

const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Role Name" },
    { key: "code", label: "Code" },
    { key: "status", label: "Status", render: (r) => (r.status ? "✅ Active" : "⛔ Disabled") },
];

/** permissions matrix editor - one row per inner (sub) module, grouped under its sidebar heading */
function PermissionsMatrix({ value = [], onChange, disabled }) {
    const known = new Set(MODULES.map((m) => m.key));
    const rows = (value ?? []).filter((p) => known.has(p.module));
    const find = (m) => rows.find((p) => p.module === m);
    const get = (m, a) => !!find(m)?.[a];

    const update = (module, action, checked) => {
        const next = { ...blank(module), ...find(module), [action]: checked };
        // create / edit / delete need view; removing view removes everything
        if (checked && action !== "can_view") next.can_view = true;
        if (!checked && action === "can_view") ACTION_COLS.forEach((a) => (next[a] = false));
        onChange([...rows.filter((p) => p.module !== module), next]);
    };

    const setRow = (module, checked) => {
        const next = blank(module);
        ACTION_COLS.forEach((a) => (next[a] = checked));
        onChange([...rows.filter((p) => p.module !== module), next]);
    };

    return (
        <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b">
                        <th className="text-left p-3 font-semibold">Module</th>
                        {ACTION_COLS.map((a) => (
                            <th key={a} className="p-3 font-semibold capitalize w-20">{a.replace("can_", "")}</th>
                        ))}
                        <th className="p-3 font-semibold w-16">All</th>
                    </tr>
                </thead>
                <tbody>
                    {MODULE_GROUPS.map((g) => {
                        const grouped = g.modules.length > 1;
                        return [
                            grouped && (
                                <tr key={g.label} className="bg-slate-50/60 border-b">
                                    <td colSpan={ACTION_COLS.length + 2} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g.label}</td>
                                </tr>
                            ),
                            ...g.modules.map((m) => (
                                <tr key={m.key} className="border-b last:border-0">
                                    <td className={"p-3 font-medium " + (grouped ? "pl-7" : "")}>{m.label}</td>
                                    {ACTION_COLS.map((a) => (
                                        <td key={a} className="p-3 text-center">
                                            <input type="checkbox" checked={get(m.key, a)} disabled={disabled}
                                                onChange={(e) => update(m.key, a, e.target.checked)} className="accent-brand-600" />
                                        </td>
                                    ))}
                                    <td className="p-3 text-center">
                                        <input type="checkbox" checked={ACTION_COLS.every((a) => get(m.key, a))} disabled={disabled}
                                            onChange={(e) => setRow(m.key, e.target.checked)} className="accent-brand-600" />
                                    </td>
                                </tr>
                            )),
                        ];
                    })}
                </tbody>
            </table>
            <p className="text-xs text-slate-400 p-3 bg-slate-50">Tip: create, edit or delete also grants “view”. A menu group (e.g. Sales) appears only when at least one of its modules can be viewed.</p>
        </div>
    );
}

export default function Roles() {
    const fields = [
        { name: "name", label: "Role Name", required: true },
        { name: "code", label: "Role Code" },
        { name: "status", label: "Active", type: "checkbox", default: true },
        {
            name: "permissions", label: "Module Permissions", default: [],
            render: (p) => <PermissionsMatrix {...p} />,
        },
    ];
    return (
        <Routes>
            <Route index element={<CrudPage title="Roles" endpoint="admin/roles" columns={columns} />} />
            <Route path="create" element={<CrudForm title="Role" endpoint="admin/roles" fields={fields} backTo="/roles" />} />
            <Route path=":id" element={<CrudForm title="Role" endpoint="admin/roles" fields={fields} backTo="/roles" />} />
            <Route path=":id/edit" element={<CrudForm title="Role" endpoint="admin/roles" fields={fields} backTo="/roles" />} />
        </Routes>
    );
}
