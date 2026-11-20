<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WebsiteOrderController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_name'  => 'required|string',
            'customer_phone' => 'required|string',
            'address'        => 'required|string',
            'notes'          => 'nullable|string',
            'items'          => 'required|array|min:1',
            'items.*.product_id' => 'nullable|integer',
            'items.*.deal_id'    => 'nullable|integer',
            'items.*.name'       => 'required|string',
            'items.*.unit_price' => 'required|numeric',
            'items.*.qty'        => 'required|integer|min:1',
            'items.*.modifiers'  => 'nullable|array',
        ]);

        $order = DB::transaction(function () use ($data) {
            $total = collect($data['items'])->sum(fn ($i) => $i['unit_price'] * $i['qty']);
            $order = Order::create([
                'order_number'   => 'ORD-'.now()->format('ymd').'-'.strtoupper(bin2hex(random_bytes(3))),
                'type'           => 'website',
                'customer_name'  => $data['customer_name'],
                'customer_phone' => $data['customer_phone'],
                'address'        => $data['address'],
                'notes'          => $data['notes'] ?? null,
                'status'         => 'RECEIVED',
                'total'          => $total,
            ]);
            foreach ($data['items'] as $i) {
                $order->items()->create([
                    'product_id' => $i['product_id'] ?? null,
                    'deal_id'    => $i['deal_id'] ?? null,
                    'name'       => $i['name'],
                    'unit_price' => $i['unit_price'],
                    'qty'        => $i['qty'],
                    'modifiers'  => $i['modifiers'] ?? [],
                ]);
            }
            // a first-time website customer is saved for the phone lookup on admin orders
            Customer::rememberFromOrder($data['customer_name'], $data['customer_phone'], $data['address']);
            return $order;
        });

        return response()->json(['orderId' => $order->order_number], 201);
    }

    /** Public status endpoint for the website's live tracking (5s polling). */
    public function track(string $orderNumber)
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();

        // map internal RMS status to website tracking stages
        $map = [
            'RECEIVED'          => 'PLACED',
            'PREPARING'         => 'PREPARING',
            'READY'             => 'PREPARING',
            'OUT_FOR_DELIVERY'  => 'ON_THE_WAY',
            'DELIVERED'         => 'DELIVERED',
            'CANCELLED'         => 'CANCELLED',
        ];

        return response()->json([
            'status' => $map[$order->status] ?? 'PLACED',
            'internal_status' => $order->status,
        ]);
    }
}
