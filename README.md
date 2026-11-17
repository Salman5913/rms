# RMS (Laravel 11 + React) + Next.js Restaurant Website

## Setup — RMS backend + React frontend

```bash
# 1. Create a fresh Laravel 11 skeleton and copy this folder's contents over it
composer create-project laravel/laravel rms-install
cp -r rms/* rms-install/ && cd rms-install

# 2. Install PHP deps (sanctum for API tokens)
composer require laravel/sanctum
php artisan install:api            # publishes sanctum migrations

# 3. Configure DB (match the .sql file OR run the migrations)
cp .env.example .env
php artisan key:generate
# import database/restaurant_rms.sql  (full schema + seeds)  — OR —
php artisan migrate && php artisan db:seed   (migrations + AdminSeeder + DemoSeeder)

# 4. Storage link for uploaded images
php artisan storage:link

# 5. React frontend (lives in resources/js)
npm install
npm run build            # or: npm run dev (hot reload)

# 6. Serve
php artisan serve        # RMS on http://localhost:8000
```

Default admin login: **admin@restaurant.com / password**

## Website API endpoints (used by Next.js)

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/home | banners + popular + deals + categories with products (incl. options/extras) |
| POST | /api/orders | place website order `{customer_name, customer_phone, address, notes, items[]}` |
| GET | /api/orders/{orderNumber}/status | order status for live tracking |
| POST | /api/login | RMS login (returns Bearer token) |

## Admin API (auth:sanctum + permission middleware)

`/api/admin/...` — dashboard, banners, categories, products, options, extras,
deals, orders, stock-items, stock-use-vouchers, users, roles.
`GET ...?export=csv` on resources streams a CSV (opens in Excel).
`POST /api/admin/{resource}/bulk-delete` `{ids:[...]}`.
`POST /api/admin/import/{resource}` `{rows:[...]}` for Excel/CSV imports.

## Notes

- Administrator role bypasses all permission checks.
- Excel import/export is implemented as CSV (opens natively in Excel, no extra
  PHP extension needed). Swap to maatwebsite/excel later if strict .xlsx is needed.

- Import Csv correction
- Branch Filter and crud 
- On create order ALL CREATE ORDER PAGE THE ITEMS ARE COMING in correct on search
- Show products in order listing
- Order detail page
- Change the theme design 
