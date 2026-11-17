<?php

namespace App\Http\Controllers\Admin;

use App\Helpers\ImportHelper;
use App\Http\Controllers\Controller;
use App\Http\Requests\ImportFileRequest;
use App\Models\Category;
use App\Models\Deal;
use App\Models\DeliveryArea;
use App\Models\Extra;
use App\Models\Option;
use App\Models\Product;
use App\Models\Role;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * File-based (CSV / .xlsx) imports for every admin module.
 * Each function tells ImportHelper which model to insert into and how a row maps to it.
 * A row whose name matches an existing record updates it; otherwise a new record is created.
 * GET  admin/import/{module}/sample  → CSV template with the expected headers.
 */
class ImportController extends Controller
{
    public function __construct(private ImportHelper $helper) {}

    public function categories(ImportFileRequest $request)
    {
        return $this->run($request, Category::class, $this->categoryConfig());
    }

    public function products(ImportFileRequest $request)
    {
        return $this->run($request, Product::class, $this->productConfig());
    }

    public function options(ImportFileRequest $request)
    {
        return $this->run($request, Option::class, $this->priceItemConfig());
    }

    public function extras(ImportFileRequest $request)
    {
        return $this->run($request, Extra::class, $this->priceItemConfig());
    }

    public function deals(ImportFileRequest $request)
    {
        return $this->run($request, Deal::class, $this->dealConfig());
    }

    public function deliveryAreas(ImportFileRequest $request)
    {
        return $this->run($request, DeliveryArea::class, $this->deliveryAreaConfig());
    }

    public function stockItems(ImportFileRequest $request)
    {
        return $this->run($request, StockItem::class, $this->stockItemConfig());
    }

    public function users(ImportFileRequest $request)
    {
        return $this->run($request, User::class, $this->userConfig());
    }

    public function roles(ImportFileRequest $request)
    {
        return $this->run($request, Role::class, $this->roleConfig());
    }

    public function sample(string $module)
    {
        $configs = [
            'categories' => [$this->categoryConfig(), ['name' => 'Burgers', 'status' => '1']],
            'products' => [$this->productConfig(), ['name' => 'Zinger Burger', 'description' => 'Crispy chicken burger', 'price' => '550', 'availability' => 'both', 'categories' => '1|2', 'status' => '1']],
            'options' => [$this->priceItemConfig(), ['name' => 'Large', 'price' => '100', 'status' => '1']],
            'extras' => [$this->priceItemConfig(), ['name' => 'Cheese', 'price' => '80', 'status' => '1']],
            'deals' => [$this->dealConfig(), ['name' => 'Family Deal', 'description' => '2 burgers + fries', 'price' => '1500', 'products' => '1|3', 'status' => '1']],
            'delivery-areas' => [$this->deliveryAreaConfig(), ['name' => 'Gulberg', 'delivery_charges' => '150', 'status' => '1']],
            'stock-items' => [$this->stockItemConfig(), ['name' => 'Flour', 'unit' => 'kg', 'value' => '25']],
            'users' => [$this->userConfig(), ['name' => 'Ali', 'email' => 'ali@example.com', 'password' => 'secret123', 'role_id' => '1', 'status' => '1']],
            'roles' => [$this->roleConfig(), ['name' => 'Cashier', 'code' => 'cashier', 'status' => '1']],
        ];
        abort_unless(isset($configs[$module]), 404);

        [$config, $example] = $configs[$module];

        return response($this->helper->sample($config['columns'], $example), 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$module}-sample.csv\"",
        ]);
    }

    private function run(ImportFileRequest $request, string $model, array $config)
    {
        $counts = $this->helper->import($request->file('file'), $model, $config);

        return response()->json([
            'ok' => true,
            'imported' => $counts['created'] + $counts['updated'],
            ...$counts,
        ]);
    }

    /* ---------------- per-module import definitions ---------------- */

    private function categoryConfig(): array
    {
        return [
            'columns' => ['name', 'image', 'status'],
            'booleans' => ['status'],
            'rules' => [
                'name' => 'required|string|max:255',
                'image' => 'nullable|string',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                'name' => $r['name'],
                'slug' => Str::slug($r['name']),
                'image' => $r['image'] ?? null,
                'status' => $r['status'] ?? true,
            ],
        ];
    }

    private function productConfig(): array
    {
        return [
            'columns' => ['name', 'description', 'price', 'image', 'badge', 'is_popular', 'availability',
                'options_title', 'extras_title', 'categories', 'options', 'extras', 'status'],
            'booleans' => ['is_popular', 'status'],
            'lists' => ['categories', 'options', 'extras'],
            'rules' => [
                'name' => 'required|string|max:255',
                'description' => 'required|string',
                'price' => 'required|numeric|min:0',
                'image' => 'nullable|string',
                'badge' => 'nullable|string|max:100',
                'is_popular' => 'nullable|boolean',
                'availability' => 'required|in:website,pickup,both,unavailable',
                'options_title' => 'nullable|string|max:255|required_with:options',
                'extras_title' => 'nullable|string|max:255|required_with:extras',
                'categories' => 'required|array|min:1',
                'categories.*' => 'integer|exists:categories,id',
                'options' => 'array',
                'options.*' => 'integer|exists:options,id',
                'extras' => 'array',
                'extras.*' => 'integer|exists:extras,id',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                ...collect($r)->only(['name', 'description', 'price', 'image', 'badge', 'availability', 'options_title', 'extras_title'])->all(),
                'is_popular' => $r['is_popular'] ?? false,
                'status' => $r['status'] ?? true,
            ],
            'after' => function (Product $p, array $r) {
                $this->syncIfGiven($p, $r, ['categories', 'options', 'extras']);
            },
        ];
    }

    /** options and extras share the same shape */
    private function priceItemConfig(): array
    {
        return [
            'columns' => ['name', 'price', 'status'],
            'booleans' => ['status'],
            'rules' => [
                'name' => 'required|string|max:255',
                'price' => 'required|numeric|min:0',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                'name' => $r['name'],
                'price' => $r['price'],
                'status' => $r['status'] ?? true,
            ],
        ];
    }

    private function deliveryAreaConfig(): array
    {
        return [
            'columns' => ['name', 'delivery_charges', 'status'],
            'booleans' => ['status'],
            'rules' => [
                'name' => 'required|string|max:255',
                'delivery_charges' => 'required|numeric|min:0',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                'name' => $r['name'],
                'delivery_charges' => $r['delivery_charges'],
                'status' => $r['status'] ?? true,
            ],
        ];
    }

    private function dealConfig(): array
    {
        return [
            'columns' => ['name', 'description', 'price', 'image', 'badge', 'options_title', 'extras_title',
                'products', 'options', 'extras', 'status'],
            'booleans' => ['status'],
            'lists' => ['products', 'options', 'extras'],
            'rules' => [
                'name' => 'required|string|max:255',
                'description' => 'required|string',
                'price' => 'required|numeric|min:0',
                'image' => 'nullable|string',
                'badge' => 'nullable|string|max:100',
                'options_title' => 'nullable|string|max:255|required_with:options',
                'extras_title' => 'nullable|string|max:255|required_with:extras',
                'products' => 'required|array|min:1',
                'products.*' => 'integer|exists:products,id',
                'options' => 'array',
                'options.*' => 'integer|exists:options,id',
                'extras' => 'array',
                'extras.*' => 'integer|exists:extras,id',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                ...collect($r)->only(['name', 'description', 'price', 'image', 'badge', 'options_title', 'extras_title'])->all(),
                'status' => $r['status'] ?? true,
            ],
            'after' => function (Deal $d, array $r) {
                $this->syncIfGiven($d, $r, ['products', 'options', 'extras']);
            },
        ];
    }

    private function stockItemConfig(): array
    {
        return [
            'columns' => ['name', 'unit', 'value'],
            'rules' => [
                'name' => 'required|string|max:255',
                'unit' => 'required|in:kg,number,dozen,packs,mann',
                'value' => 'required|numeric|min:0',
            ],
        ];
    }

    private function userConfig(): array
    {
        return [
            'columns' => ['name', 'email', 'password', 'role_id', 'status'],
            'booleans' => ['status'],
            'distinct' => ['email'],
            'rules' => fn (?User $existing) => [
                'name' => 'required|string|max:255',
                'email' => ['required', 'email', Rule::unique('users', 'email')->ignore($existing?->id)],
                'password' => 'required|string|min:6',
                'role_id' => 'required|integer|exists:roles,id',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                ...collect($r)->only(['name', 'email', 'role_id'])->all(),
                ...(isset($r['password']) ? ['password' => Hash::make($r['password'])] : []),
                'status' => $r['status'] ?? true,
            ],
        ];
    }

    /** sync only the relation columns the row filled in; a blank cell leaves the links as they are */
    private function syncIfGiven($model, array $row, array $relations): void
    {
        foreach ($relations as $rel) {
            if (array_key_exists($rel, $row)) {
                $model->{$rel}()->sync($row[$rel]);
            }
        }
    }

    private function roleConfig(): array
    {
        return [
            'columns' => ['name', 'code', 'status'],
            'booleans' => ['status'],
            'rules' => [
                'name' => 'required|string|max:255',
                'code' => 'nullable|string|max:100',
                'status' => 'nullable|boolean',
            ],
            'prepare' => fn (array $r) => [
                'name' => $r['name'],
                'code' => $r['code'] ?? Str::slug($r['name']),
                'status' => $r['status'] ?? true,
            ],
        ];
    }
}
