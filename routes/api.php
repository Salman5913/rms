<?php

use App\Http\Controllers\Admin\BannerController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\DailyCloseController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DealController;
use App\Http\Controllers\Admin\DeliveryAreaController;
use App\Http\Controllers\Admin\EmployeeController;
use App\Http\Controllers\Admin\EmployeePaymentController;
use App\Http\Controllers\Admin\ExpenseCategoryController;
use App\Http\Controllers\Admin\ExpenseController;
use App\Http\Controllers\Admin\ExtraController;
use App\Http\Controllers\Admin\ImportController;
use App\Http\Controllers\Admin\LoanController;
use App\Http\Controllers\Admin\LoanRepaymentController;
use App\Http\Controllers\Admin\OptionController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\StockItemController;
use App\Http\Controllers\Admin\StockUseController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\VendorController;
use App\Http\Controllers\Admin\VendorTransactionController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\WebsiteOrderController;
use Illuminate\Support\Facades\Route;

/* ---------- public website APIs ---------- */
Route::get('/home', [HomeController::class, 'home']);
Route::post('/orders', [WebsiteOrderController::class, 'store']);
Route::get('/orders/{orderNumber}/status', [WebsiteOrderController::class, 'track']);

/* ---------- auth ---------- */
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/upload', [UploadController::class, 'store']);

    Route::prefix('admin')->group(function () {
        Route::get('dashboard', [DashboardController::class, 'index']);

        Route::get('banners', [BannerController::class, 'index']);
        Route::put('banners', [BannerController::class, 'update']);

        foreach ([
            'categories' => CategoryController::class,
            'products' => ProductController::class,
            'options' => OptionController::class,
            'extras' => ExtraController::class,
            'deals' => DealController::class,
            'delivery-areas' => DeliveryAreaController::class,
            'stock-items' => StockItemController::class,
            'employees' => EmployeeController::class,
            'users' => UserController::class,
            'roles' => RoleController::class,
        ] as $res => $ctrl) {
            Route::get($res, [$ctrl, 'index']);
            Route::post($res, [$ctrl, 'store']);
            Route::get("$res/all", [$ctrl, 'all']);
            Route::get("$res/{id}", [$ctrl, 'show']);
            Route::post("$res/{id}", [$ctrl, 'update']);   // POST = multipart safe update
            Route::delete("$res/{id}", [$ctrl, 'destroy']);
            Route::post("$res-bulk-delete", [$ctrl, 'bulkDelete']);
        }

        /* same CRUD routes, but the API itself enforces the role permission (new modules go here, see CLAUDE.md §5.6) */
        foreach ([
            'vendors' => VendorController::class,
            'loans' => LoanController::class,
            'expense-categories' => ExpenseCategoryController::class,
            'customers' => CustomerController::class,
        ] as $res => $ctrl) {
            Route::get($res, [$ctrl, 'index'])->middleware("permission:$res,view");
            Route::post($res, [$ctrl, 'store'])->middleware("permission:$res,create");
            Route::get("$res/all", [$ctrl, 'all'])->middleware("permission:$res,view");
            Route::get("$res/{id}", [$ctrl, 'show'])->middleware("permission:$res,view");
            Route::post("$res/{id}", [$ctrl, 'update'])->middleware("permission:$res,edit");
            Route::delete("$res/{id}", [$ctrl, 'destroy'])->middleware("permission:$res,delete");
            Route::post("$res-bulk-delete", [$ctrl, 'bulkDelete'])->middleware("permission:$res,delete");
        }

        /* vendor ledger: purchases (credit) and payments (debit), all under the vendors permission module */
        Route::get('vendors/{id}/ledger', [VendorController::class, 'ledger'])->middleware('permission:vendors,view');
        Route::post('vendors/{id}/transactions', [VendorTransactionController::class, 'store'])->middleware('permission:vendors,create');
        Route::get('vendor-transactions/{id}/receipt', [VendorTransactionController::class, 'receipt'])->middleware('permission:vendors,view');
        Route::post('vendor-transactions/{id}', [VendorTransactionController::class, 'update'])->middleware('permission:vendors,edit');
        Route::delete('vendor-transactions/{id}', [VendorTransactionController::class, 'destroy'])->middleware('permission:vendors,delete');

        /* employee salary payments and advances (permission module: employee-payments) */
        Route::get('employee-payments', [EmployeePaymentController::class, 'index'])->middleware('permission:employee-payments,view');
        Route::get('employees/{id}/ledger', [EmployeePaymentController::class, 'ledger'])->middleware('permission:employee-payments,view');
        Route::get('employees/{id}/salary-suggestion', [EmployeePaymentController::class, 'suggestion'])->middleware('permission:employee-payments,view');
        Route::post('employees/{id}/payments', [EmployeePaymentController::class, 'store'])->middleware('permission:employee-payments,create');
        Route::get('employee-payments/{id}/slip', [EmployeePaymentController::class, 'slip'])->middleware('permission:employee-payments,view');
        Route::post('employee-payments/{id}', [EmployeePaymentController::class, 'update'])->middleware('permission:employee-payments,edit');
        Route::delete('employee-payments/{id}', [EmployeePaymentController::class, 'destroy'])->middleware('permission:employee-payments,delete');

        /* loan statement and repayments (permission module: loans). Loans are never part of Profit & Loss. */
        Route::get('loans/{id}/statement', [LoanController::class, 'statement'])->middleware('permission:loans,view');
        Route::post('loans/{id}/repayments', [LoanRepaymentController::class, 'store'])->middleware('permission:loans,create');
        Route::post('loan-repayments/{id}', [LoanRepaymentController::class, 'update'])->middleware('permission:loans,edit');
        Route::delete('loan-repayments/{id}', [LoanRepaymentController::class, 'destroy'])->middleware('permission:loans,delete');

        /* extra expenses (permission module: expenses); subtracted in Profit & Loss */
        Route::get('expenses', [ExpenseController::class, 'index'])->middleware('permission:expenses,view');
        Route::get('expenses/report', [ExpenseController::class, 'report'])->middleware('permission:expenses,view');
        Route::get('expenses/print', [ExpenseController::class, 'print'])->middleware('permission:expenses,view');
        Route::get('expenses/categories', [ExpenseController::class, 'categories'])->middleware('permission:expenses,view');
        Route::post('expenses', [ExpenseController::class, 'store'])->middleware('permission:expenses,create');
        Route::post('expenses/{id}', [ExpenseController::class, 'update'])->middleware('permission:expenses,edit');
        Route::delete('expenses/{id}', [ExpenseController::class, 'destroy'])->middleware('permission:expenses,delete');

        /* file imports (CSV / .xlsx) - one function per module, all via ImportHelper */
        Route::prefix('import')->controller(ImportController::class)->group(function () {
            Route::get('{module}/sample', 'sample');
            Route::post('categories', 'categories');
            Route::post('products', 'products');
            Route::post('options', 'options');
            Route::post('extras', 'extras');
            Route::post('deals', 'deals');
            Route::post('delivery-areas', 'deliveryAreas');
            Route::post('stock-items', 'stockItems');
            Route::post('employees', 'employees');
            Route::post('users', 'users');
            Route::post('roles', 'roles');
        });

        // order create page: fill the customer's details from their phone (needs delivery order access, not the customers module)
        Route::get('customers-lookup', [CustomerController::class, 'lookup'])->middleware('permission:delivery-orders,create');

        // rider dropdown for delivery orders - deliberately outside the employees module
        Route::get('riders', [EmployeeController::class, 'riders']);

        Route::get('orders', [OrderController::class, 'index']);
        Route::get('orders/{id}', [OrderController::class, 'show']);
        Route::post('orders/{id}', [OrderController::class, 'update']);
        Route::post('orders/{id}/status', [OrderController::class, 'updateStatus']);
        Route::post('orders/{id}/rider', [OrderController::class, 'assignRider']);
        Route::post('orders/{id}/viewed', [OrderController::class, 'markViewed']);
        Route::post('orders', [OrderController::class, 'store']);          // pickup walk-in
        Route::delete('orders/{id}', [OrderController::class, 'destroy']);
        Route::post('orders-bulk-delete', [OrderController::class, 'bulkDelete']);

        /* day close: view = page + history, create = close a day, edit = reopen */
        Route::get('daily-close', [DailyCloseController::class, 'show'])->middleware('permission:daily-close,view');
        Route::get('daily-closes', [DailyCloseController::class, 'index'])->middleware('permission:daily-close,view');
        Route::post('daily-close', [DailyCloseController::class, 'store'])->middleware('permission:daily-close,create');
        Route::post('daily-close/{id}/reopen', [DailyCloseController::class, 'reopen'])->middleware('permission:daily-close,edit');

        Route::post('stock-use-vouchers', [StockUseController::class, 'store']);
        Route::get('stock-use-vouchers', [StockUseController::class, 'index']);
    });
});
