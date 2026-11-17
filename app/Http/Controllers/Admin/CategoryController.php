<?php

namespace App\Http\Controllers\Admin;

use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CategoryController extends ApiCrudController
{
    protected string $model = Category::class;
    protected array $search = ['name', 'slug'];
    protected array $with = ['products'];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name'   => 'required|string|max:255',
            'image'  => 'nullable|string',
            'status' => 'nullable|boolean',
        ];
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['slug'] = $f['slug'] ?? Str::slug($f['name']);
        $f['status'] = $data['status'] ?? true;
        return $f;
    }

    protected function syncRelations($model, array $data): void {}
}
