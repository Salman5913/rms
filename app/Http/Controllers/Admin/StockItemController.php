<?php

namespace App\Http\Controllers\Admin;

use App\Models\StockItem;
use Illuminate\Http\Request;

class StockItemController extends ApiCrudController
{
    protected string $model = StockItem::class;
    protected array $search = ['name'];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name'  => 'required|string|max:255',
            'unit'  => 'required|in:kg,number,dozen,packs,mann',
            'value' => 'required|numeric|min:0',
        ];
    }

    protected function syncRelations($model, array $data): void {}
}
