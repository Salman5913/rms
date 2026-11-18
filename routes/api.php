<?php

use App\Http\Controllers\Admin\BannerController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\DailyCloseController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DealController;
use App\Http\Controllers\Admin\DeliveryAreaController;
use App\Http\Controllers\Admin\ExtraController;
use App\Http\Controllers\Admin\ImportController;
use App\Http\Controllers\Admin\LabourController;
use App\Http\Controllers\Admin\OptionController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\StockItemController;
use App\Http\Controllers\Admin\StockUseController;
use App\Http\Controllers\Admin\UserController;
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
            'labours' => LabourController::class,
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
            Route::post('labours', 'labours');
            Route::post('users', 'users');
            Route::post('roles', 'roles');
        });

        // rider dropdown for delivery orders - deliberately outside the labours module
        Route::get('riders', [LabourController::class, 'riders']);

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
