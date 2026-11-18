<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $from = Carbon::parse($request->query('from', now()->toDateString()))->startOfDay();
        $to = Carbon::parse($request->query('to', now()->toDateString()))->endOfDay();

        // what counts on the dashboard (both order counts and sales): walk-in orders (pickup / dine-in)
        // straight away, while website and home delivery orders count only once delivered
        // (not while pending, never when cancelled)
        $sold = Order::whereBetween('created_at', [$from, $to])->get()
            ->filter(fn ($o) => ! in_array($o->type, ['website', 'delivery'], true) || $o->status === 'DELIVERED');
        $web = $sold->where('type', 'website');
        $pick = $sold->where('type', 'pickup');
        $dinein = $sold->where('type', 'dinein');
        $delivery = $sold->where('type', 'delivery');

        // daily series for line chart
        $days = $from->copy();
        $labels = $ordersCount = $revenue = [];
        while ($days <= $to) {
            $dayOrders = $sold->filter(fn ($o) => $o->created_at->isSameDay($days));
            $labels[] = $days->toDateString();
            $ordersCount[] = $dayOrders->count();
            $revenue[] = (float) $dayOrders->sum('total');
            $days->addDay();
        }

        return response()->json([
            'total_sales' => (float) $sold->sum('total'),
            'total_orders' => $sold->count(),
            'website_orders' => $web->count(),
            'pickup_orders' => $pick->count(),
            'dinein_orders' => $dinein->count(),
            'delivery_orders' => $delivery->count(),
            'website_sales' => (float) $web->sum('total'),
            'pickup_sales' => (float) $pick->sum('total'),
            'dinein_sales' => (float) $dinein->sum('total'),
            'delivery_sales' => (float) $delivery->sum('total'),
            'delivery_charges' => (float) $sold->sum('delivery_charges'),
            'chart' => ['labels' => $labels, 'orders' => $ordersCount, 'revenue' => $revenue],
        ]);
    }
}
