# RMS — Project Constitution

Restaurant Management System: Laravel API + React SPA admin panel (+ a separate Next.js website that uses the public APIs).
Stack: Laravel 13, PHP 8.3, MySQL, Sanctum (Bearer tokens), PHPUnit feature tests (in-memory SQLite), React 18 + react-router-dom 6 + axios, Tailwind 3, Vite.

**Read this file before every task and follow it. Before you change anything, read the existing code that does the same kind of thing and copy how it works. Don't invent a new pattern if one already exists.**

---

## 1. Commands
- Tests: `php artisan test --filter=<Name>`. Never run the full suite unless asked.
- Lint PHP: `./vendor/bin/pint` (only on files you changed: `./vendor/bin/pint <paths>`)
- Frontend build check: `npm run build`
- API docs: if `dedoc/scramble` is installed (`composer.json`), run `php artisan scramble:export` after changing an endpoint and tell me. It is not installed right now, so skip this step and say so.

## 2. Golden rules
1. **Reuse before you create.** Use the shared backend classes and React components listed in §4. A new component or helper is only allowed when nothing existing fits. If that happens, put it in the shared file (`ui.jsx`, `Crud.jsx`, `utils.jsx`) so other modules can reuse it, and tell me why.
2. **Follow the existing flow.** Use the reference modules (`Employee`, `DeliveryArea`) as templates. Use the same naming, file locations, route shape, response shape and UI style.
3. **Every new module gets permissions on the Role module and guarded pages.** See §5. A module is not finished without this.
4. **Change only what the task needs.** No drive-by refactors, renames or reformatting of unrelated code. If you notice something broken elsewhere, report it; don't fix it silently.
5. **Keep in-sync lists in sync** (§6). Most bugs here come from a module key that was added in one list and forgotten in another.
6. When a rule here conflicts with the existing code, tell me before choosing.
7. **Questions and bug reports get an answer, not a change.** If I only ask something or report a problem ("why is X not showing?", "is this done?"), don't edit any file. First tell me the reason or answer, then propose the change and ask whether to make it. Change code only after I say yes.
8. **MOST IMPORTANT: optimized queries in every API you create or touch.** No endpoint may put load on the server or run slowly. Follow §2.1 on every new API and on every change to an existing one.
9. **Simple, understandable code in every API you create or touch.** A junior developer must be able to read it top to bottom: small methods with plain names (`totalForRange()`, `categoryTotals()`), no clever abstractions, comments only where the "why" isn't obvious.
10. **Every listing endpoint is paginated.** Never return an unbounded list. `CrudPage` modules get this from `ApiCrudController`; custom pages paginate in their service and show `Pagination` under the table. **Never change the pagination (page size, params, behaviour) of an existing custom module.**

### 2.1 Query performance (applies to every new API and every change to an existing one)
- Calculate totals in the database (`SUM` / `COUNT` / `GROUP BY`). Never load rows into PHP to sum or count them.
- No N+1 queries: eager-load relations with only the columns needed, e.g. `with('category:id,name')`.
- Select only the columns the screen uses (`->select([...])` / `->get([...])`), not `SELECT *`.
- Filter dates on the column directly (`whereBetween('date_col', [$from, $to])`, `>=` / `<=`). Never wrap the column in `whereDate()`, `DATE()` or any function: it stops index use.
- Paginate every list (rule 10). Print endpoints may return all rows of a range, but cap them (e.g. 5,000) and say so when the cap is hit.
- Build a filtered query once (one small service method for date range / filters / search) and reuse it for the list, its totals and its print, so the figures always match.
- Grouped totals are one `GROUP BY` query, not one query per group.
- "Does X exist?" checks use `->exists()`, not `->count()` or loading rows.
- Add indexes in the migration for the columns you filter, join or group on.
- Tests assert the query count of list/report endpoints stays small and doesn't grow with the number of rows (`DB::enableQueryLog()`; same count with 5 and 50 rows).
- Applies to new code and to code you are changing for the task. Don't refactor other existing modules unless asked (rule 4); report slow queries you notice instead.

## 3. Architecture (how the app works)

### Backend
- `routes/api.php`
  - Public website APIs: `/home`, `POST /orders`, `/orders/{orderNumber}/status`, `/login`.
  - Everything else sits inside `auth:sanctum` → `prefix('admin')`.
  - Standard CRUD modules are registered in **one `foreach` map** (`'<module-key>' => Controller::class`). This generates `index`, `store`, `all`, `show`, `update` (**POST** `{id}`, multipart-safe), `destroy`, `<module>-bulk-delete`.
  - Imports: `admin/import/{module}` (one method per module in `ImportController`) and `admin/import/{module}/sample`.
- `app/Http/Controllers/Admin/ApiCrudController.php` is the **generic CRUD base**: search, pagination (`per_page`, default 10), `?all=1`, `?export=csv` with date range (`FiltersByDateRange`), bulk delete, and store/update wrapped in a DB transaction.
  A concrete controller only defines `$model`, `$search`, `$with`, `rules()`, `fields()`, `syncRelations()`, and optionally `filter()` for extra query-string filters.
- Validation: put rules in a `FormRequest` (e.g. `EmployeeRequest`). Reuse that FormRequest's `rules()` in **both** the controller's `rules()` and the import config, as Employee does. Inline rules in `rules()` are acceptable for very small modules (DeliveryArea), but prefer a FormRequest for anything new.
- Responses: return models with `response()->json(...)`, as `ApiCrudController` does. Don't add a separate Actions/Services/API Resources layer for a normal CRUD module. Only use one for real business logic (orders, stock) and only after asking.
- Models: `$fillable`, `$casts` (booleans!), constants for enum-like values (`Employee::USER_TYPES`), and scopes or rule helpers for reusable queries (`scopeActiveRiders`, `activeRiderRule()`).
- Imports: `app/Helpers/ImportHelper.php` handles CSV/.xlsx. Each module adds a `xxxConfig()` (`columns`, `rules`, `booleans`, `lists`, `prepare`, `after`), a public method that calls `$this->run(...)`, and an entry in `sample()`.
- Permissions:
  - `roles` + `role_permissions` (`module`, `can_view`, `can_create`, `can_edit`, `can_delete`).
  - The role with code `administrator` bypasses every check (backend and frontend).
  - `/api/me` and `/api/login` return `permissions[module] = {view, create, edit, delete}`.
  - Middleware alias `permission` → `CheckPermission`, used as `->middleware('permission:<module>,<action>')`.

### Frontend (`resources/js`)
- `app.jsx` holds all routes. `<Guard>` checks login and wraps `<Layout>`. The helper `guard(module, action, element)` wraps a page in `RequirePermission`.
- `auth.jsx` provides:
  - `useAuth()` → `{ user, can(module, action='view'), login, logout }`
  - `userCan`
  - `RequirePermission` (if access is missing it redirects back, or goes to the first permitted page, or `/no-access`)
  - `useRedirectBack`
  - `homePathFor`
- `modules.js`: `MODULE_GROUPS` / `MODULES` define the permission modules shown in the Roles permission matrix and are used for "first allowed page" redirects.
- `Layout.jsx`: the sidebar `NAV` (items are hidden with `can(module)`; a group is shown only if at least one child is visible) plus the `ICON` map.
- `api.js`: the axios instance (`/api` base, Bearer token, 401 sends the user to /login). **Always use it; never call `fetch`/axios directly** (except `utils.jsx` CSV download, which already exists).

## 4. Existing building blocks — use these

| Need | Use |
|---|---|
| List page with search, pagination, create/edit/delete buttons, bulk delete, import, export | `CrudPage` from `Crud.jsx` (props: `title`, `endpoint`, `columns`, `searchPlaceholder`, `params`, `filters`, `canCreate`, `canImport`, `canExport`, `extraActions`, `module`) |
| Create / edit / view form | `CrudForm` from `Crud.jsx` (props: `title`, `endpoint`, `fields`, `backTo`, `module`). Field types: text, `number`, `email`, `password`, `select` (`options`), `checkbox`, or a custom `render: (p) => <Comp {...p} />` |
| Inputs | `Field`, `inputCls`, `Select` (searchable), `MultiSelect` (`endpoint`), `ImageUpload`, `Btn`, `Spinner`, `Pagination`, `Ico` from `ui.jsx` |
| Status in a list column | `StatusText` from `ui.jsx` (`render: (r) => <StatusText on={r.status} />`) |
| Secondary row actions in a list ("⋯" menu) | `ActionMenu` from `ui.jsx` (items: `label`, `icon`, `to` or `onClick`, `className`; falsy items are skipped) |
| Confirm / alert dialogs | `useDialog()` from `Dialog.jsx`. Never use `window.alert/confirm` |
| CSV export with date range | `ExportModal.jsx` + `utils.jsx` `handleExport` (CrudPage already uses it) |
| Date display | `formatDateTime` from `utils.jsx` |
| Permission checks in UI | `useAuth().can(module, action)`, `RequirePermission`, `guard()` |
| Backend CRUD | extend `ApiCrudController` |
| Backend import | `ImportHelper` via `ImportController` |
| Date-range filtering / export file names | `FiltersByDateRange` trait |

Styling: Tailwind with the existing look (white `rounded-2xl` cards, `border-slate-200`, `brand-*` colours from `tailwind.config.js`, status in list pages shown as coloured text with `StatusText` from `ui.jsx` (green "Active" / grey "Disabled"; pass `onText`/`offText` for other pairs), no emojis. Order pages keep their own status style). Copy classes from existing pages; don't introduce a new UI library.

**Same layout as the existing modules.** When you build a new list, modal or row action, first find the closest existing one and copy its layout, order and wording. Don't invent your own arrangement:
- **List row actions:** the main icon buttons go first (View / Edit / Delete, same order and classes as `CrudPage`). Every other action goes into **one** `ActionMenu` ("⋯") at the end of the row, like the Vendors list (Ledger, Add purchase, Add payment). Don't add extra separate icon buttons for secondary actions.
- **Modal footer:** use `Modal` from `ui.jsx` with the buttons in this order: Cancel · Save & Print (only when the entry has a printout) · Save. The print button is always labelled "Save & Print", never just "Print".
- **Report / list page order:** header (title + buttons) → totals cards → filters card → table → pagination, like the Loans page. Totals never go below the filters.
- **Prints:** whenever a page gets an A4 print, also add a **short receipt for the 80mm thermal printer** from the same data and filters (copy `printShortLedger` in `Vendors.jsx`: monospace, 280px wide, `@page { size: 80mm auto }`). Header buttons in this order: "Print Short Receipt" · "Print <Report/Ledger>", with the `print` icon. Both use `printHtml` + `escapeHtml` from `utils.jsx`.
- If no existing module has the thing you need, tell me which layout you chose and why.

## 5. New module checklist (MANDATORY — do every step)

`<key>` = kebab-case module key (e.g. `delivery-areas`). The **same key** is the API resource name, the permission module, and the frontend `endpoint` suffix (`admin/<key>`). `Crud.jsx` derives the permission module from the endpoint, so they must match.

**Backend**
1. Migration: a **new** file in `database/migrations` (`YYYY_MM_DD_NNNNNN_create_<table>_table.php`). Never edit an existing migration. Write it but **don't run it** (see §8).
2. Model in `app/Models` with `$fillable`, `$casts`, and constants for fixed value lists.
3. `FormRequest` in `app/Http/Requests` for validation.
4. Controller in `app/Http/Controllers/Admin` extending `ApiCrudController` (copy `EmployeeController`).
5. Route: add `'<key>' => XController::class` to the CRUD `foreach` map in `routes/api.php`. Non-CRUD endpoints go next to it with explicit routes.
6. **Backend permission enforcement:** apply `permission:<key>,<action>` middleware to the new module's routes (index/show/all → `view`, store → `create`, update → `edit`, destroy/bulk-delete → `delete`). Import → `create`. Without this, a direct API call bypasses the role check. (Note: the existing modules in the `foreach` don't have this middleware yet. See §9.)
7. **Role module:** add `<key>` to `RoleController::MODULES`. Otherwise the role form rejects the permission with a 422.
8. Import (if the module has a list page with import, which `CrudPage` shows by default): add `xxxConfig()`, the public method, the `sample()` entry and the `Route::post('<key>', ...)` in the import group. Otherwise pass `canImport={false}` to `CrudPage`.

**Frontend**

9. **Role permission matrix + redirects:** add `{ key: "<key>", label, path }` to the right group in `MODULE_GROUPS` (`modules.js`). This makes it appear in the Roles → Module Permissions matrix with view/create/edit/delete.
10. **Sidebar:** add the item to `NAV` in `Layout.jsx` with `module: "<key>"` (plus an `ICON` entry if you need a new icon). Keep the same order and grouping as `MODULE_GROUPS`.
11. Page in `resources/js/pages/<Name>.jsx` using `CrudPage` + `CrudForm` with nested `<Routes>`: index, `create`, `:id` (view), `:id/edit` (copy `Employees.jsx`).
12. **Direct-URL protection:** register the route in `app.jsx`.
    - Pages built with `CrudPage`/`CrudForm` already wrap themselves in `RequirePermission` (view/create/edit/view). Register them as `path="<key>/*"`.
    - **Any custom page or sub-route that is not `CrudPage`/`CrudForm` must be wrapped with `guard("<key>", "<action>", <Page />)`**: view for lists/details, create for create pages, edit for edit pages.
    - Inside pages, hide buttons/actions with `can("<key>", "create" | "edit" | "delete")`.
13. Tests: `tests/Feature/<Name>Test.php` in the existing PHPUnit class style. In `setUp()`, migrate only the needed migration paths (roles, users, personal_access_tokens, role_permissions update, plus your table) and act as a user.
    - Cover CRUD, validation and search.
    - Cover permissions: a user whose role lacks the permission gets **403**, and the `administrator` role passes.
    - If the routes use the `permission` middleware, the acting user in CRUD tests must have the `administrator` role (a user with no role is forbidden).
    - Add a case to `RolePermissionTest` that the new `<key>` is accepted by the role endpoint.
14. Run only the new or affected tests (`--filter`), pint on changed PHP files, and `npm run build`. Then report the results and the migration command for me to run.

**Done = every step above is complete, or I've been told explicitly why a step was skipped.**

## 6. Lists that must stay in sync
| Thing | Where it lives |
|---|---|
| Permission module keys | `RoleController::MODULES` ⇄ `resources/js/modules.js` `MODULE_GROUPS` ⇄ `Layout.jsx` `NAV[].module` ⇄ route `guard(...)` / `CrudPage` endpoint |
| Enum values | Model constants (e.g. `Employee::USER_TYPES`) ⇄ the matching JS arrays in the page (e.g. `USER_TYPES` in `Employees.jsx`) |
| Validation | FormRequest `rules()` ⇄ ImportController config `rules` |
| Order types | `order.type` ⇄ `orderModule(type)` → `<type>-orders` permission modules |

## 7. Changing existing modules
- Read the module's controller, request, model, page and tests first.
- Keep the URL, response shape and permission key unchanged unless told otherwise. The Next.js website depends on the public APIs (`/api/home`, `/api/orders`, status tracking), so don't break their response shape.
- Renaming or splitting a permission module requires a **data migration** that moves existing `role_permissions` rows (see `2026_11_15_000002_add_delete_and_sub_modules_to_role_permissions.php`).
- Every endpoint change needs a feature test (new or updated).
- Orders use their own controller (`OrderController`) and sub-module permissions (`pickup-orders`, `website-orders`, `dinein-orders`, `delivery-orders`). Follow that, not the generic CRUD flow.

## 8. Database safety
- Never run anything that writes to or modifies the database without my explicit approval in this conversation. This includes migrate (any variant), db:seed, tinker, raw SQL, factories outside tests, and any CLI client (mysql, psql).
- Writing migration files is fine. Running them is not. Tell me the command and wait.
- Before asking, state exactly what the command will change and which database it targets.
- Never run destructive commands (migrate:fresh, migrate:refresh, migrate:reset, db:wipe), even if approved earlier. Ask each time.
- Read-only queries (SELECT, `migrate:status`) are fine.
- Tests use in-memory SQLite (`phpunit.xml`); running tests is fine.

## 9. Known gaps (don't "fix" these unless asked; mention them when relevant)
- Existing admin CRUD and order routes don't apply the `permission` middleware, so the API itself doesn't enforce roles for them yet (only the UI does). New modules must apply it (§5.6).
- The `employees`, `products`, `extras`, `options`, `categories`, `deals`, `delivery-areas`, `stock-items`, `users`, `roles` and `orders/:id`, `orders/:id/edit` routes in `app.jsx` rely on `CrudPage`/`CrudForm` or the page itself for permission checks. Check this when you touch them.

## 10. Don'ts
- Don't read `vendor/`, `storage/`, `bootstrap/cache/`, `node_modules/` or `.env`.
- Don't add new packages (composer/npm) without asking.
- Don't edit existing migrations.
- Don't use `window.alert/confirm`, raw `fetch`, or a new HTTP client.
- Don't hard-code permission checks by role name. Always use module + action (`administrator` bypass is already handled centrally).
