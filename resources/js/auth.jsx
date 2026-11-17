import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api";
import { MODULES } from "./modules";

const AuthCtx = createContext(null);

/** module/action permission for a given user (administrator bypasses) */
export const userCan = (user, module, action = "view") => {
    if (!user) return false;
    if (user.role?.code === "administrator") return true;
    return !!user.permissions?.[module]?.[action];
};

/** the first page (sidebar order) the user may view, or /no-access */
export const homePathFor = (user) => MODULES.find((m) => userCan(user, m.key))?.path ?? "/no-access";

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(!!localStorage.getItem("rms_token"));

    useEffect(() => {
        if (localStorage.getItem("rms_token")) {
            api.get("/me").then((r) => setUser(r.data)).catch(() => {}).finally(() => setLoading(false));
        }
    }, []);

    const login = async (email, password) => {
        const r = await api.post("/login", { email, password });
        localStorage.setItem("rms_token", r.data.token);
        setUser(r.data.user);
        return r.data.user;
    };

    const logout = async () => {
        try { await api.post("/logout"); } catch {}
        localStorage.removeItem("rms_token");
        setUser(null);
        location.href = "/login";
    };

    /** module visibility / action permission (administrator bypasses) */
    const can = (module, action = "view") => userCan(user, module, action);

    return <AuthCtx.Provider value={{ user, loading, login, logout, can }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** Sends the user back to where they came from; if they opened the URL directly (no in-app
    history), to the first page they may view, or to /no-access when there is none. */
export function useRedirectBack() {
    const nav = useNavigate();
    const { pathname } = useLocation();
    const { can } = useAuth();
    return useCallback(() => {
        if ((window.history.state?.idx ?? 0) > 0) return nav(-1);
        const home = MODULES.find((m) => can(m.key) && m.path !== pathname)?.path;
        nav(home ?? "/no-access", { replace: true });
    }, [nav, pathname, can]);
}

/** Renders children only when the user has `action` on `module`; otherwise redirects back. */
export function RequirePermission({ module, action = "view", children }) {
    const { can } = useAuth();
    const redirectBack = useRedirectBack();
    const allowed = can(module, action);

    useEffect(() => {
        if (!allowed) redirectBack();
    }, [allowed]); // eslint-disable-line

    return allowed ? children : null;
}
