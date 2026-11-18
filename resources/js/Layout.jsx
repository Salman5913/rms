import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

/* Single items: { label, path, module, exact? }
   Dropdown groups: { label, children: [{ label, path, module }] }
   `module` is used for permission checks via can(module). A group has no permission of its own:
   it is shown only when at least one child is viewable, and lists only those children. */
const NAV = [
    { label: "Dashboard", icon: "dashboard", path: "/", module: "dashboard", exact: true },
    { label: "Website Banner", icon: "banner", path: "/banners", module: "banners" },
    {
        label: "Products", icon: "products",
        children: [
            { label: "Products", path: "/products", module: "products" },
            { label: "Extras", path: "/extras", module: "extras" },
            { label: "Options", path: "/options", module: "options" },
        ],
    },
    { label: "Categories", icon: "tag", path: "/categories", module: "categories" },
    { label: "Deals", icon: "deals", path: "/deals", module: "deals" },
    { label: "Delivery Areas", icon: "area", path: "/delivery-areas", module: "delivery-areas" },
    {
        label: "Sales", icon: "sales",
        children: [
            { label: "Pickup Orders", path: "/orders/pickup", module: "pickup-orders" },
            { label: "Website Orders", path: "/orders/website", module: "website-orders" },
            { label: "Dine-In Orders", path: "/orders/dinein", module: "dinein-orders" },
            { label: "Home Delivery", path: "/orders/delivery", module: "delivery-orders" },
        ],
    },
    {
        label: "Inventory", icon: "inventory",
        children: [
            { label: "Stock Items", path: "/stock-items", module: "stock-items" },
            { label: "Stock Use Voucher", path: "/stock-use", module: "stock-use" },
        ],
    },
    {
        label: "Labour", icon: "labour",
        children: [
            { label: "Labour", path: "/labours", module: "labours" },
        ],
    },
    {
        label: "Reports", icon: "reports",
        children: [
            { label: "Daily Close", path: "/daily-close", module: "daily-close" },
        ],
    },
    { label: "Users", icon: "users", path: "/users", module: "users" },
    { label: "Roles", icon: "roles", path: "/roles", module: "roles" },
];

const ICON = {
    dashboard: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
    banner: "M2.25 15.75l5.16-5.16a2.25 2.25 0 013.18 0l5.16 5.16m-1.5-1.5l1.41-1.41a2.25 2.25 0 013.18 0l2.16 2.16M3.75 21h16.5A1.5 1.5 0 0021.75 19.5v-15A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21zM15.75 8.25h.01",
    products: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
    tag: "M9.57 3H5.25A2.25 2.25 0 003 5.25v4.32c0 .6.24 1.17.66 1.59l9.58 9.58a2.25 2.25 0 003.18 0l4.32-4.32a2.25 2.25 0 000-3.18L11.16 3.66A2.25 2.25 0 009.57 3zM6 6h.01",
    deals: "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 19.5v-8.25M12 4.88c-1.04-1.9-2.6-2.63-3.9-2.38C6.6 2.8 6 4.2 6.9 5.2 7.7 6.1 9.4 6.4 12 6.4m0-1.52c1.04-1.9 2.6-2.63 3.9-2.38 1.5.3 2.1 1.7 1.2 2.7-.8.9-2.5 1.2-5.1 1.2M3 8.25h18v3H3v-3zM12 6.4V21",
    sales: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.11c0-1.11-.8-2.07-1.9-2.23a48.5 48.5 0 00-1.12-.15M16.5 3.75V3a1.5 1.5 0 00-1.5-1.5H9A1.5 1.5 0 007.5 3v.75m9 0H7.5m0 0a48 48 0 00-1.12.15C5.28 4.04 4.5 5 4.5 6.11V19.5a2.25 2.25 0 002.25 2.25h.75",
    inventory: "M20.25 7.5l-.63 10.4a2.25 2.25 0 01-2.25 2.1H6.63a2.25 2.25 0 01-2.25-2.1L3.75 7.5m16.5 0H3.75m16.5 0a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5V6a1.5 1.5 0 001.5 1.5M9.75 11.25h4.5",
    users: "M15 19.13A9.4 9.4 0 0018 19.5a9.4 9.4 0 002.63-.37 3 3 0 00-4.12-2.54M15 19.13V19.13A5.98 5.98 0 009 14.25a5.98 5.98 0 00-6 4.88 12 12 0 006 1.37 11.9 11.9 0 006-1.37zM15 9.75a3 3 0 11-6 0 3 3 0 016 0zm6 1.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
    roles: "M9 12.75L11.25 15 15 9.75m-3-7.04A11.96 11.96 0 013.6 6 12 12 0 003 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75A11.96 11.96 0 0112 2.71z",
    labour: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.12a7.5 7.5 0 0115 0A17.9 17.9 0 0112 21.75c-2.68 0-5.22-.58-7.5-1.63z",
    reports: "M3 13.13C3 12.5 3.5 12 4.13 12h2.25c.62 0 1.12.5 1.12 1.13v6.75c0 .62-.5 1.12-1.12 1.12H4.13A1.13 1.13 0 013 19.88v-6.75zM9.75 8.63c0-.63.5-1.13 1.13-1.13h2.25c.62 0 1.12.5 1.12 1.13v11.25c0 .62-.5 1.12-1.12 1.12h-2.25a1.13 1.13 0 01-1.13-1.12V8.63zM16.5 4.13c0-.63.5-1.13 1.13-1.13h2.25C20.5 3 21 3.5 21 4.13v15.75c0 .62-.5 1.12-1.12 1.12h-2.25a1.13 1.13 0 01-1.13-1.12V4.13z",
    area: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.14-7.5 11.25-7.5 11.25S4.5 17.64 4.5 10.5a7.5 7.5 0 1115 0z",
    logout: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9",
};

function Icon({ name, className = "w-[18px] h-[18px]" }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            className={className + " flex-none"}>
            <path d={ICON[name]} />
        </svg>
    );
}



function isChildActive(children, pathname) {
    return children.some((c) => pathname === c.path || pathname.startsWith(c.path + "/"));
}

export default function Layout() {
    const { user, logout, can } = useAuth();
    const { pathname } = useLocation();

    // dropdowns the user has opened manually; route-matched ones open automatically
    const [open, setOpen] = useState(() => {
        const initial = {};
        NAV.forEach((n) => {
            if (n.children) initial[n.label] = isChildActive(n.children, location.pathname);
        });
        return initial;
    });

    // auto-open the dropdown of the page we navigate to
    useEffect(() => {
        setOpen((prev) => {
            const next = { ...prev };
            NAV.forEach((n) => {
                if (n.children && isChildActive(n.children, pathname)) next[n.label] = true;
            });
            return next;
        });
    }, [pathname]);

    const toggle = (label) => setOpen((prev) => ({ ...prev, [label]: !prev[label] }));

    const linkCls = ({ isActive }) =>
        "flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition " +
        (isActive ? "bg-brand-600 text-white font-semibold shadow-sm" : "hover:bg-white/10 hover:text-white");

    const initials = (user?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

    return (
        <div className="min-h-screen bg-[#F4F6FB] flex">
            {/* sidebar */}
            <aside className="w-64 bg-[#161B2E] text-slate-400 flex flex-col fixed inset-y-0">
                <div className="h-16 flex items-center gap-3 px-5 text-white">
                    <span className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-lg">🍽️</span>
                    <span className="text-lg font-extrabold tracking-wide">RMS</span>
                </div>
                <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pt-2 pb-6 space-y-1">
                    {NAV.map((n) => {
                        /* ---- dropdown group ---- */
                        if (n.children) {
                            const visible = n.children.filter((c) => can(c.module));
                            if (!visible.length) return null;
                            const expanded = open[n.label] ?? false;
                            const active = isChildActive(n.children, pathname);

                            return (
                                <div key={n.label}>
                                    <button onClick={() => toggle(n.label)}
                                        className={
                                            "w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition " +
                                            (active ? "text-white font-semibold bg-white/5" : "hover:bg-white/10 hover:text-white")
                                        }>
                                        <Icon name={n.icon} />
                                        <span className="flex-1 text-left">{n.label}</span>
                                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
                                            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                            className={"w-4 h-4 flex-none opacity-70 transition-transform duration-200 " + (expanded ? "rotate-90" : "")}>
                                            <path d="M7.5 4.5L13 10l-5.5 5.5" />
                                        </svg>
                                    </button>
                                    {expanded && (
                                        <div className="mt-1 ml-5 pl-3 border-l border-white/10 space-y-0.5">
                                            {visible.map((c) => (
                                                <NavLink key={c.path} to={c.path}
                                                    className={({ isActive }) =>
                                                        "block px-3 py-2 text-sm rounded-lg transition " +
                                                        (isActive ? "bg-brand-600 text-white font-semibold" : "hover:bg-white/10 hover:text-white")
                                                    }>
                                                    {c.label}
                                                </NavLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        /* ---- single link ---- */
                        if (!can(n.module)) return null;
                        return (
                            <NavLink key={n.label} to={n.path} end={n.exact} className={linkCls}>
                                <Icon name={n.icon} />
                                {n.label}
                            </NavLink>
                        );
                    })}
                </nav>
            </aside>

            {/* main */}
            <div className="flex-1 ml-64 min-w-0">
                {/* header */}
                <header className="h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-30">
                    <h1 className="font-bold text-slate-700">Restaurant Management System</h1>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-sm font-bold flex items-center justify-center">{initials}</span>
                            <div className="text-right">
                                <p className="text-sm font-bold text-slate-800 leading-tight">{user?.name}</p>
                                <p className="text-xs text-slate-400">{user?.role?.name}</p>
                            </div>
                        </div>
                        <button onClick={logout}
                            className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold px-3.5 py-2 rounded-xl transition">
                            <Icon name="logout" className="w-4 h-4" /> Logout
                        </button>
                    </div>
                </header>
                <main className="p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
