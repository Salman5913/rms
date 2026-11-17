<?php

namespace App\Http\Controllers\Admin;

use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends ApiCrudController
{
    protected string $model = Product::class;
    protected array $search = ['name', 'description'];
    protected array $with = ['categories', 'options', 'extras'];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name'         => 'required|string|max:255',
            'description'  => 'required|string',
            'price'        => 'required|numeric|min:0',
            'image'        => 'nullable|string',
            'badge'        => 'nullable|string|max:100',
            'is_popular'   => 'nullable|boolean',
            'availability' => 'required|in:website,pickup,both,unavailable',
            'options_title' => 'nullable|string|max:255|required_with:options',
            'extras_title'  => 'nullable|string|max:255|required_with:extras',
            'categories'   => 'required|array|min:1',
            'categories.*' => 'integer|exists:categories,id',
            'options'      => 'nullable|array',
            'options.*'    => 'integer|exists:options,id',
            'extras'       => 'nullable|array',
            'extras.*'     => 'integer|exists:extras,id',
            'status'       => 'nullable|boolean',
        ];
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['is_popular'] = $data['is_popular'] ?? false;
        $f['status'] = $data['status'] ?? true;
        return $f;
    }

    protected function syncRelations($model, array $data): void
    {
        $model->categories()->sync($data['categories'] ?? []);
        $model->options()->sync($data['options'] ?? []);
        $model->extras()->sync($data['extras'] ?? []);
    }
}
