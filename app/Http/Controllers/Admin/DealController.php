<?php

namespace App\Http\Controllers\Admin;

use App\Models\Deal;
use Illuminate\Http\Request;

class DealController extends ApiCrudController
{
    protected string $model = Deal::class;
    protected array $search = ['name', 'description'];
    protected array $with = ['products', 'options', 'extras'];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name'         => 'required|string|max:255',
            'description'  => 'required|string',
            'price'        => 'required|numeric|min:0',
            'image'        => 'nullable|string',
            'badge'        => 'nullable|string|max:100',
            'options_title' => 'nullable|string|max:255|required_with:options',
            'extras_title'  => 'nullable|string|max:255|required_with:extras',
            'products'     => 'required|array|min:1',
            'products.*'   => 'integer|exists:products,id',
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
        $f['status'] = $data['status'] ?? true;
        return $f;
    }

    protected function syncRelations($model, array $data): void
    {
        $model->products()->sync($data['products'] ?? []);
        $model->options()->sync($data['options'] ?? []);
        $model->extras()->sync($data['extras'] ?? []);
    }
}
