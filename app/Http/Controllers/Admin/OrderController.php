<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\FiltersByDateRange;
use App\Http\Controllers\Controller;
use App\Models\DeliveryArea;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    use FiltersByDateRange;

    private const CSV_MAP = ['RECEIVED' => 'PLACED', 'PREPARING' => 'PREPARING', 'READY' => 'PREPARING',
        'OUT_FOR_DELIVERY' => 'ON_THE_WAY', 'DELIVERED' => 'DELIVERED'];

    public function index(Request $request)
    {
        $q = Order::with('items')->where('type', $request->query('type', 'website'));

        if ($s = $request->query('search')) {
            $q->where(fn ($qq) => $qq->where('order_number', 'like', "%{$s}%")
                ->orWhere('customer_name', 'like', "%{$s}%")
                ->orWhere('customer_phone', 'like', "%{$s}%"));
        }

        if ($request->query('export') === 'csv') {
            $rows = $this->applyDateRange($q, $request)->orderByDesc('id')->get();
            $delivery = $request->query('type') === 'delivery';

            return response()->streamDownload(function () use ($rows, $delivery) {
                $out = fopen('php://output', 'w');
                fputcsv($out, $delivery
                    ? ['order_number', 'delivery_area', 'order_amount', 'delivery_charges', 'total', 'status', 'created_at']
                    : ['order_number', 'customer_name', 'customer_phone', 'status', 'total', 'created_at']);
                foreach ($rows as $r) {
                    $status = self::CSV_MAP[$r->status] ?? $r->status;
                    fputcsv($out, $delivery
                        ? [$r->order_number, $r->delivery_area, $r->total - $r->delivery_charges, $r->delivery_charges, $r->total, $status, $r->created_at]
                        : [$r->order_number, $r->customer_name, $r->customer_phone, $status, $r->total, $r->created_at]);
                }
                fclose($out);
            }, $this->exportFileName(ucfirst($request->query('type', 'website')).'-Orders', $request), ['Content-Type' => 'text/csv']);
        }

        return response()->json($q->orderByDesc('id')->paginate(15));
    }

    public function show($id)
    {
        return response()->json(Order::with('items')->findOrFail($id));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            // 'customer_name'  => 'required|string',
            'customer_phone' => 'nullable|string',
            'type' => 'required|string',
            'delivery_area_id' => 'required_if:type,delivery|nullable|integer|exists:delivery_areas,id,status,1',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'nullable|integer',
            'items.*.deal_id' => 'nullable|integer',
            'items.*.name' => 'required|string',
            'items.*.unit_price' => 'required|numeric',
            'items.*.qty' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
        ]);

        // charges come from the area record, never from the client
        $area = ($data['type'] === 'delivery') ? DeliveryArea::find($data['delivery_area_id']) : null;

        $order = DB::transaction(function () use ($data, $area) {
            $total = collect($data['items'])->sum(fn ($i) => $i['unit_price'] * $i['qty']) + ($area->delivery_charges ?? 0);
            $order = Order::create([
                'delivery_area_id' => $area?->id,
                'delivery_area' => $area?->name,
                'delivery_charges' => $area->delivery_charges ?? 0,
                'order_number' => '',
                'type' => $data['type'] ?? 'pickup',
                'customer_name' => $data['customer_name'] ?? null,
                'customer_phone' => $data['customer_phone'] ?? null,
                'status' => 'RECEIVED',
                'total' => $total,
            ]);
            $order->update(['order_number' => 'ON-'.$order->id]);
            foreach ($data['items'] as $i) {
                $order->items()->create($i + ['product_id' => $i['product_id'] ?? null, 'deal_id' => $i['deal_id'] ?? null]);
            }

            return $order;
        });

        return response()->json($order->load('items'), 201);
    }

    public function update(Request $request, $id)
    {
        $order = Order::findOrFail($id);

        // website orders can only be edited while they are still RECEIVED
        if ($order->type === 'website' && $order->status !== 'RECEIVED') {
            return response()->json(['message' => 'This order can no longer be edited.'], 422);
        }

        $data = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'nullable|integer',
            'items.*.deal_id' => 'nullable|integer',
            'items.*.name' => 'required|string',
            'items.*.unit_price' => 'required|numeric',
            'items.*.qty' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
        ]);

        DB::transaction(function () use ($order, $data) {
            $total = collect($data['items'])->sum(fn ($i) => $i['unit_price'] * $i['qty']) + $order->delivery_charges;
            $order->update(['total' => $total]);
            $order->items()->delete();
            foreach ($data['items'] as $i) {
                $order->items()->create($i + ['product_id' => $i['product_id'] ?? null, 'deal_id' => $i['deal_id'] ?? null]);
            }
        });

        return response()->json($order->load('items'));
    }

    public function updateStatus(Request $request, $id)
    {
        $data = $request->validate(['status' => 'required|in:RECEIVED,PREPARING,READY,OUT_FOR_DELIVERY,DELIVERED']);
        $order = Order::findOrFail($id);
        $order->update(['status' => $data['status']]);

        return response()->json($order);
    }

    public function markViewed($id)
    {
        $order = Order::findOrFail($id);
        $order->update(['is_viewed' => 1]);

        return response()->json(['ok' => true]);
    }

    public function destroy($id)
    {
        Order::findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    public function bulkDelete(Request $request)
    {
        $ids = $request->validate(['ids' => 'required|array'])['ids'];
        Order::whereIn('id', $ids)->delete();

        return response()->json(['ok' => true]);
    }
}
