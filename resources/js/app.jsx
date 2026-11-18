import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, RequirePermission, homePathFor, useAuth } from "./auth";
import Layout from "./Layout";
import { Spinner } from "./ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Banners from "./pages/Banners";
import Products from "./pages/Products";
import Extras from "./pages/Extras";
import DeliveryAreas from "./pages/DeliveryAreas";
import Options from "./pages/Options";
import Categories from "./pages/Categories";
import Deals from "./pages/Deals";
import StockItems from "./pages/StockItems";
import StockUse from "./pages/StockUse";
import Users from "./pages/Users";
import Roles from "./pages/Roles";
import Labours from "./pages/Labours";
import WebsiteOrders, { WebsiteOrderView } from "./pages/WebsiteOrders";
import PickupOrders, { PickupCreate } from "./pages/PickupOrders";
import DineinOrders, { DineInCreate } from "./pages/DineinOrders";
import HomeDeliveryOrders, { HomeDeliveryCreate } from "./pages/HomeDeliveryOrders";
import OrderEdit from "./pages/OrderEdit";
import DailyClose from "./pages/DailyClose";
import { DialogProvider } from "./Dialog";
import "./index.css";

function Guard() {
    const { user, loading } = useAuth();
    if (loading) return <Spinner />;
    if (!user) return <Navigate to="/login" replace />;
    return <Outlet />;
}

/** route element that needs `action` on `module`; direct URL access without it redirects back */
const guard = (module, action, element) => <RequirePermission module={module} action={action}>{element}</RequirePermission>;

/** "/" shows the dashboard when permitted, otherwise forwards to the first permitted module */
function Home() {
    const { user, can } = useAuth();
    return can("dashboard") ? <Dashboard /> : <Navigate to={homePathFor(user)} replace />;
}

function NoAccess() {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
            <h2 className="text-xl font-extrabold text-slate-800 mb-2">No access</h2>
            <p className="text-sm text-slate-500">Your role doesn't have permission to view any page. Ask an administrator to update your role.</p>
        </div>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Guard />}>
                <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="banners" element={guard("banners", "view", <Banners />)} />
                    <Route path="products/*" element={<Products />} />
                    <Route path="extras/*" element={<Extras />} />
                    <Route path="options/*" element={<Options />} />
                    <Route path="categories/*" element={<Categories />} />
                    <Route path="deals/*" element={<Deals />} />
                    <Route path="delivery-areas/*" element={<DeliveryAreas />} />
                    <Route path="stock-items/*" element={<StockItems />} />
                    <Route path="stock-use" element={guard("stock-use", "view", <StockUse />)} />
                    <Route path="users/*" element={<Users />} />
                    <Route path="roles/*" element={<Roles />} />
                    <Route path="labours/*" element={<Labours />} />
                    <Route path="daily-close" element={guard("daily-close", "view", <DailyClose />)} />
                    <Route path="orders/website" element={guard("website-orders", "view", <WebsiteOrders />)} />
                    <Route path="orders/:id" element={<WebsiteOrderView />} />
                    <Route path="orders/:id/edit" element={<OrderEdit />} />
                    <Route path="orders/pickup" element={guard("pickup-orders", "view", <PickupOrders />)} />
                    <Route path="orders/pickup/create" element={guard("pickup-orders", "create", <PickupCreate />)} />
                    <Route path="orders/dinein" element={guard("dinein-orders", "view", <DineinOrders />)} />
                    <Route path="no-access" element={<NoAccess />} />
                    <Route path="orders/dinein/create" element={guard("dinein-orders", "create", <DineInCreate />)} />
                    <Route path="orders/delivery" element={guard("delivery-orders", "view", <HomeDeliveryOrders />)} />
                    <Route path="orders/delivery/create" element={guard("delivery-orders", "create", <HomeDeliveryCreate />)} />
                </Route>
            </Route>
        </Routes>
    );
}

createRoot(document.getElementById("app")).render(
    <BrowserRouter>
        <AuthProvider>
            <DialogProvider>
                <App />
            </DialogProvider>
        </AuthProvider>
    </BrowserRouter>
);
