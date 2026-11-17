<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StockItem;
use App\Models\StockUseVoucher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockUseController extends Controller
{
    public function index()
    {
        return response()->json(StockUseVoucher::with(['items.stockItem', 'user'])->orderByDesc('id')->paginate(15));
    }

    /** Creates a voucher AND subtracts the used amounts from stock. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'items'              => 'required|array|min:1',
            'items.*.stock_item_id' => 'required|integer|exists:stock_items,id',
            'items.*.value'      => 'required|numeric|min:0.01',
        ]);

        // reject duplicates + insufficient stock
        $ids = collect($data['items'])->pluck('stock_item_id');
        if ($ids->count() !== $ids->unique()->count()) {
            return response()->json(['message' => 'Duplicate items selected'], 422);
        }
        foreach ($data['items'] as $i) {
            $item = StockItem::find($i['stock_item_id']);
            if ($item->value < $i['value']) {
                return response()->json(['message' => "Insufficient stock for {$item->name}"], 422);
            }
        }

        $v = DB::transaction(function () use ($data, $request) {
            $v = StockUseVoucher::create([
                'voucher_number' => 'SV-'.now()->format('ymd').'-'.strtoupper(bin2hex(random_bytes(2))),
                'user_id' => $request->user()->id,
            ]);
            foreach ($data['items'] as $i) {
                $v->items()->create($i);
                StockItem::whereId($i['stock_item_id'])->decrement('value', $i['value']);
            }
            return $v;
        });

        return response()->json(StockUseVoucher::with('items.stockItem')->find($v->id), 201);
    }
}
