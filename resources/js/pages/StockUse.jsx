import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { Btn, Select, inputCls } from "../ui";

const emptyRow = () => ({ stock_item_id: "", value: "" });

/** Stock Use Voucher: dynamic rows, items excluded once picked, zero-stock hidden. */
export default function StockUse() {
    const [items, setItems] = useState([]);
    const [rows, setRows] = useState([emptyRow()]);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const nav = useNavigate();
    const canCreate = useAuth().can("stock-use", "create");

    useEffect(() => {
        api.get("/admin/stock-items", { params: { all: 1 } }).then((r) =>
            setItems(r.data.filter((i) => Number(i.value) > 0)),
        );
    }, []);

    const chosen = rows.map((r) => r.stock_item_id).filter(Boolean);
    const availableFor = (row) =>
        items.filter(
            (i) =>
                !chosen.includes(String(i.id)) ||
                String(i.id) === String(row.stock_item_id),
        );

    const setRow = (i, patch) =>
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    const save = async () => {
        setError("");
        if (rows.some((r) => !r.stock_item_id || !r.value))
            return setError("Fill all rows or remove empty ones");
        setSaving(true);
        try {
            await api.post("/admin/stock-use-vouchers", {
                items: rows.map((r) => ({
                    stock_item_id: Number(r.stock_item_id),
                    value: Number(r.value),
                })),
            });
            nav("/stock-items");
        } catch (err) {
            setError(err.response?.data?.message ?? "Failed to save voucher");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <h2 className="text-xl font-extrabold text-slate-800 mb-5">
                Stock Use Voucher
            </h2>

            <div className="flex flex-col-reverse lg:flex-row gap-6 items-start">
                <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">
                            {error}
                        </p>
                    )}

                    {rows.map((row, i) => {
                        const item = items.find(
                            (x) => String(x.id) === String(row.stock_item_id),
                        );
                        return (
                            <div key={i} className="flex items-start gap-2">
                                <Select
                                    value={row.stock_item_id}
                                    onChange={(v) =>
                                        setRow(i, {
                                            stock_item_id: String(v),
                                        })
                                    }
                                    placeholder="Select item"
                                    options={availableFor(row).map((x) => ({
                                        value: String(x.id),
                                        label: `${x.name} (available: ${x.value} ${x.unit})`,
                                    }))}
                                    className="flex-1 min-w-0"
                                />

                                <input
                                    type="number"
                                    min="0"
                                    value={row.value}
                                    placeholder={
                                        item
                                            ? `Enter amount in ${item.unit}`
                                            : "Value"
                                    }
                                    onChange={(e) =>
                                        setRow(i, { value: e.target.value })
                                    }
                                    className={inputCls + " !w-56 shrink-0"}
                                />

                                <div className="flex gap-1 pt-1">
                                    {rows.length > 1 && (
                                        <button
                                            onClick={() =>
                                                setRows((rs) =>
                                                    rs.filter(
                                                        (_, j) => j !== i,
                                                    ),
                                                )
                                            }
                                            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100"
                                            title="Remove row"
                                        >
                                            −
                                        </button>
                                    )}
                                    {i === rows.length - 1 && (
                                        <button
                                            onClick={() =>
                                                setRows((rs) => [
                                                    ...rs,
                                                    emptyRow(),
                                                ])
                                            }
                                            className="w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100"
                                            title="Add row"
                                        >
                                            ＋
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ---------- actions card ---------- */}
                <aside className="w-full lg:w-80 flex-none lg:sticky lg:top-24 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
                    {canCreate && <Btn
                        onClick={save}
                        disabled={saving}
                        className="w-full justify-center py-3 bg-[#161B2E] border border-[#161B2E] text-white hover:bg-[#232a44] hover:border-[#232a44] disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Save Voucher"}
                    </Btn>}
                    <Btn
                        onClick={() => nav("/stock-items")}
                        className="w-full justify-center py-3 bg-transparent border border-[#161B2E] text-[#161B2E] hover:bg-slate-100"
                    >
                        ← Back
                    </Btn>
                </aside>
            </div>
        </div>
    );
}
