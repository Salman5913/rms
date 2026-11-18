<?php

namespace App\Http\Controllers\Admin;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RoleController extends ApiCrudController
{
    protected string $model = Role::class;

    protected array $search = ['name', 'code'];

    protected array $with = ['permissions'];

    /** inner (sub) modules permissions are granted on - keep in sync with resources/js/modules.js */
    public const MODULES = [
        'dashboard', 'banners',
        'products', 'extras', 'options',
        'categories', 'deals', 'delivery-areas',
        'pickup-orders', 'website-orders', 'dinein-orders', 'delivery-orders',
        'stock-items', 'stock-use',
        'labours',
        'daily-close',
        'users', 'roles',
    ];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'status' => 'nullable|boolean',
            'permissions' => 'nullable|array',
            'permissions.*.module' => ['required', 'string', Rule::in(self::MODULES)],
            'permissions.*.can_create' => 'boolean',
            'permissions.*.can_edit' => 'boolean',
            'permissions.*.can_view' => 'boolean',
            'permissions.*.can_delete' => 'boolean',
        ];
    }

    protected function fields(array $data): array
    {
        return [
            'name' => $data['name'],
            'code' => $data['code'] ?? Str::slug($data['name']),
            'status' => $data['status'] ?? true,
        ];
    }

    protected function syncRelations($model, array $data): void
    {
        $model->permissions()->delete();
        foreach (collect($data['permissions'] ?? [])->keyBy('module') as $module => $p) {
            $flags = [
                'can_create' => (bool) ($p['can_create'] ?? false),
                'can_edit' => (bool) ($p['can_edit'] ?? false),
                'can_delete' => (bool) ($p['can_delete'] ?? false),
            ];
            // any action on a module implies it can be viewed (and shown in the menu)
            $flags['can_view'] = (bool) ($p['can_view'] ?? false) || in_array(true, $flags, true);

            if ($flags['can_view']) {
                $model->permissions()->create(['module' => $module] + $flags);
            }
        }
    }
}
