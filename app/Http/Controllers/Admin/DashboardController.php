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

        $orders = Order::whereBetween('created_at', [$from, $to])->get();
        $web = $orders->where('type', 'website');
        $pick = $orders->where('type', 'pickup');
        $dinein = $orders->where('type', 'dinein');
        $delivery = $orders->where('type', 'delivery');

        // daily series for line chart
        $days = $from->copy();
        $labels = $ordersCount = $revenue = [];
        while ($days <= $to) {
            $dayOrders = $orders->filter(fn ($o) => $o->created_at->isSameDay($days));
            $labels[] = $days->toDateString();
            $ordersCount[] = $dayOrders->count();
            $revenue[] = (float) $dayOrders->sum('total');
            $days->addDay();
        }

        return response()->json([
            'total_sales' => (float) $orders->sum('total'),
            'total_orders' => $orders->count(),
            'website_orders' => $web->count(),
            'pickup_orders' => $pick->count(),
            'dinein_orders' => $dinein->count(),
            'delivery_orders' => $delivery->count(),
            'website_sales' => (float) $web->sum('total'),
            'pickup_sales' => (float) $pick->sum('total'),
            'dinein_sales' => (float) $dinein->sum('total'),
            'delivery_sales' => (float) $delivery->sum('total'),
            'delivery_charges' => (float) $orders->sum('delivery_charges'),
            'chart' => ['labels' => $labels, 'orders' => $ordersCount, 'revenue' => $revenue],
        ]);
    }
}
