<?php

namespace App\Http\Controllers\Admin;

use App\Models\Option;
use Illuminate\Http\Request;

class OptionController extends ApiCrudController
{
    protected string $model = Option::class;
    protected array $search = ['name'];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name'   => 'required|string|max:255',
            'price'  => 'required|numeric|min:0',
            'status' => 'nullable|boolean',
        ];
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['status'] = $data['status'] ?? true;
        return $f;
    }

    protected function syncRelations($model, array $data): void {}
}
