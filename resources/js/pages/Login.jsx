import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { homePathFor, useAuth } from "../auth";
import { Btn } from "../ui";

const fieldCls =
    "w-full bg-white border border-slate-200 rounded-lg pl-12 pr-4 py-3 text-sm placeholder:text-slate-400 " +
    "focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/* decorative restaurant counter / POS illustration */
function Illustration() {
    return (
        <svg viewBox="0 0 520 440" className="w-full max-w-[520px]" aria-hidden="true">
            <path d="M120 440 C40 360 20 230 130 150 C230 80 400 60 500 170 L520 440 Z" fill="#CFE4FB" />
            <path d="M260 440 C230 350 250 270 330 230 C410 190 480 230 520 250 L520 440 Z" fill="#B3D3F7" opacity=".7" />
            {/* person */}
            <ellipse cx="330" cy="128" rx="46" ry="52" fill="#FBD2B5" />
            <path d="M282 118 C282 70 330 55 366 78 C382 90 380 112 376 126 C360 100 320 98 282 118 Z" fill="#1F2430" />
            <path d="M270 250 C270 190 300 172 332 172 C366 172 398 190 398 250 L398 330 L270 330 Z" fill="#3B6FEA" />
            <path d="M310 172 L332 200 L354 172 Z" fill="#fff" />
            <path d="M398 215 C440 220 470 235 470 255 C470 275 448 270 420 262 Z" fill="#4C84F5" />
            <circle cx="474" cy="256" r="11" fill="#FBD2B5" />
            {/* POS terminal */}
            <rect x="130" y="270" width="120" height="82" rx="8" fill="#6B6F78" transform="rotate(-6 190 311)" />
            <rect x="140" y="278" width="100" height="66" rx="4" fill="#fff" transform="rotate(-6 190 311)" />
            <rect x="262" y="262" width="82" height="74" rx="8" fill="#5A5E67" />
            <rect x="270" y="270" width="66" height="58" rx="4" fill="#EEF4FD" />
            <rect x="196" y="352" width="90" height="26" rx="4" fill="#3A3D45" />
            {/* counter */}
            <rect x="110" y="376" width="410" height="16" fill="#C07C52" />
            <rect x="130" y="392" width="390" height="48" fill="#FBD5B8" />
        </svg>
    );
}

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError("");
        try {
            const user = await login(email, password);
            // land on the first permitted module; replace so "back" never returns to the login page
            nav(homePathFor(user), { replace: true });
        } catch {
            setError("Invalid email or password");
        } finally { setBusy(false); }
    };

    return (
        <div className="min-h-screen bg-white relative overflow-hidden">
            {/* brand */}
            <div className="px-10 pt-10 lg:px-24 lg:pt-14 relative z-10">
                <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                    <span className="w-11 h-11 rounded-xl bg-brand-600 flex items-center justify-center text-xl">🍽️</span>
                    Restaurant RMS
                </h1>
                <p className="text-slate-600 mt-2">Restaurant management system</p>
            </div>

            <div className="grid lg:grid-cols-2 items-center px-6 lg:px-24 pt-8 pb-12 gap-8 relative z-10">
                {/* login card */}
                <form onSubmit={submit}
                    className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(30,50,120,0.12)] border border-slate-100 w-full max-w-md p-8 mx-auto lg:mx-0">
                    <h2 className="text-2xl font-extrabold text-slate-900 mb-6">Login</h2>
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5 mb-4">{error}</p>}
                    <div className="space-y-4">
                        <div className="relative">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-brand-600" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.1a7.5 7.5 0 0115 0" />
                            </svg>
                            <input type="email" required placeholder="Email address" value={email}
                                onChange={(e) => setEmail(e.target.value)} className={fieldCls} />
                        </div>
                        <div className="relative">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-brand-600" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            <input type="password" required placeholder="Password" value={password}
                                onChange={(e) => setPassword(e.target.value)} className={fieldCls} />
                        </div>
                    </div>
                    <Btn type="submit" disabled={busy}
                        className="w-full mt-6 bg-gradient-to-r from-[#4C8DFF] to-brand-600 text-white py-3 justify-center rounded-lg shadow-lg shadow-brand-600/30 hover:opacity-95 disabled:opacity-50">
                        {busy ? "Signing in…" : "Log in"}
                    </Btn>
                    <p className="text-center text-xs text-slate-400 mt-5">Sign in to manage your restaurant</p>
                </form>

                {/* illustration */}
                <div className="hidden lg:flex justify-end items-end">
                    <Illustration />
                </div>
            </div>
        </div>
    );
}
