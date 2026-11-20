import { useEffect, useRef, useState } from "react";
import api from "../api";
import { Btn, Spinner } from "../ui";

/** Single page create+update: multi upload, drag to reorder, ✕ to remove, save disabled until changes. */
export default function Banners() {
    const [banners, setBanners] = useState(null);
    const [error, setError] = useState("");
    const [staged, setStaged] = useState([]); // new uploads {id:null, image, local preview}
    const [dirty, setDirty] = useState(false);
    const dragIndex = useRef(null);
    const fileRef = useRef();

    const load = () => api.get("/admin/banners")
        .then((r) => { setBanners(r.data); setError(""); })
        .catch((err) => setError(err.response?.data?.message ?? "The banners could not be loaded."));
    useEffect(() => { load(); }, []);

    if (!banners) return error ? <p className="text-sm text-red-600">{error}</p> : <Spinner />;

    const all = [...banners, ...staged];

    const onFiles = (e) => {
        const files = [...e.target.files];
        files.forEach((f) => {
            const fd = new FormData();
            fd.append("file", f);
            api.post("/upload", fd).then((r) => {
                setStaged((s) => [...s, { id: null, image: r.data.url }]);
                setDirty(true);
            });
        });
        e.target.value = "";
    };

    const remove = (index) => {
        if (index < banners.length) {
            setBanners((b) => b.filter((_, i) => i !== index));
        } else {
            setStaged((s) => s.filter((_, i) => i !== index - banners.length));
        }
        setDirty(true);
    };

    const move = (from, to) => {
        if (to < 0 || to >= all.length) return;
        const arr = [...all];
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
        // split back: existing banners keep ids; staged (id=null) go to staged
        setBanners(arr.filter((a) => a.id !== null));
        setStaged(arr.filter((a) => a.id === null));
        setDirty(true);
    };

    const save = async () => {
        const r = await api.put("/admin/banners", { images: all });
        setBanners(r.data);
        setStaged([]);
        setDirty(false);
    };

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-extrabold text-slate-800">Website Banner</h2>
                <Btn onClick={save} disabled={!dirty}
                    className="bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">
                    Save Order
                </Btn>
            </div>

            <label className="block bg-white rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center cursor-pointer hover:border-brand-300 transition mb-6">
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
                <p className="text-3xl mb-1">🖼️</p>
                <p className="text-sm font-semibold text-slate-600">Click to select multiple images</p>
                <p className="text-xs text-slate-400 mt-1">Drag images below to reorder — they slide in that order on the website</p>
            </label>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {all.map((b, i) => (
                    <div key={b.id ?? `new-${i}`}
                        draggable
                        onDragStart={() => (dragIndex.current = i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => move(dragIndex.current, i)}
                        className="relative group rounded-2xl overflow-hidden border shadow-sm cursor-grab active:cursor-grabbing">
                        <img src={b.image} alt="" className="h-36 w-full object-cover" />
                        {b.id === null && (
                            <span className="absolute bottom-2 left-2 bg-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">NEW</span>
                        )}
                        <button onClick={() => remove(i)}
                            className="absolute top-2 right-2 w-6 h-6 bg-red-600 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition shadow">
                            ✕
                        </button>
                        <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">#{i + 1}</span>
                    </div>
                ))}
                {all.length === 0 && <p className="text-slate-300 col-span-4 text-center py-8">No banners yet — upload above.</p>}
            </div>
        </div>
    );
}
