/* Permission modules, grouped the way they appear in the sidebar.
   Permissions are granted on the inner (sub) modules only; a group is just a heading.
   Keep the module keys in sync with RoleController::MODULES. */
export const MODULE_GROUPS = [
    { label: "Dashboard", modules: [{ key: "dashboard", label: "Dashboard", path: "/" }] },
    { label: "Website Banner", modules: [{ key: "banners", label: "Website Banner", path: "/banners" }] },
    {
        label: "Products", modules: [
            { key: "products", label: "Products", path: "/products" },
            { key: "extras", label: "Extras", path: "/extras" },
            { key: "options", label: "Options", path: "/options" },
        ],
    },
    { label: "Categories", modules: [{ key: "categories", label: "Categories", path: "/categories" }] },
    { label: "Deals", modules: [{ key: "deals", label: "Deals", path: "/deals" }] },
    { label: "Delivery Areas", modules: [{ key: "delivery-areas", label: "Delivery Areas", path: "/delivery-areas" }] },
    {
        label: "Sales", modules: [
            { key: "pickup-orders", label: "Pickup Orders", path: "/orders/pickup" },
            { key: "website-orders", label: "Website Orders", path: "/orders/website" },
            { key: "dinein-orders", label: "Dine-In Orders", path: "/orders/dinein" },
            { key: "delivery-orders", label: "Home Delivery", path: "/orders/delivery" },
        ],
    },
    {
        label: "Inventory", modules: [
            { key: "stock-items", label: "Stock Items", path: "/stock-items" },
            { key: "stock-use", label: "Stock Use Voucher", path: "/stock-use" },
        ],
    },
    { label: "Users", modules: [{ key: "users", label: "Users", path: "/users" }] },
    { label: "Roles", modules: [{ key: "roles", label: "Roles", path: "/roles" }] },
];

export const MODULES = MODULE_GROUPS.flatMap((g) => g.modules);

export const ACTIONS = ["view", "create", "edit", "delete"];

/** order.type ("pickup" | "website" | "dinein" | "delivery") -> its permission module */
export const orderModule = (type) => `${type ?? "pickup"}-orders`;
