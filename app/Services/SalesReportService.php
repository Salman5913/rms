<?php

namespace App\Services;

use App\Models\Order;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The sales rules shared by Daily Close (and the later Profit & Loss report):
 *  - pickup and dine-in orders count straight away
 *  - website and home delivery orders count only once DELIVERED
 *  - delivery charges (DELIVERED website and home delivery orders) are reported separately, never inside sales
 * Dates are by created_at in the app timezone.
 */
class SalesReportService
{
    /** order type => label, in report order */
    public const TYPES = [
        'pickup' => 'Pickup',
        'dinein' => 'Dine In',
        'website' => 'Website (delivered)',
        'delivery' => 'Home Delivery (delivered)',
    ];

    /** types that count only when delivered (and can be cancelled) */
    public const DELIVERED_ONLY_TYPES = ['website', 'delivery'];

    public const DELIVERED = 'DELIVERED';

    public const CANCELLED = 'CANCELLED';

    /** full report for one business date (YYYY-MM-DD) */
    public function forDate(string $date): array
    {
        $day = Carbon::parse($date);

        return $this->forRange($day->copy()->startOfDay(), $day->copy()->endOfDay());
    }

    public function forRange(Carbon $from, Carbon $to): array
    {
        $orders = Order::with('items')->whereBetween('created_at', [$from, $to])->get();
        $counted = $orders->filter(fn (Order $o) => $this->counts($o));
        // counted website / home delivery orders are the delivered ones; their charges were collected
        $delivered = $counted->whereIn('type', self::DELIVERED_ONLY_TYPES);

        $byType = collect(self::TYPES)->map(function ($label, $type) use ($counted) {
            $rows = $counted->where('type', $type);

            return ['type' => $type, 'label' => $label, 'orders' => $rows->count(), 'amount' => $this->money($rows->sum('total'))];
        })->values()->all();

        $totalSales = $this->money($counted->sum('total'));
        $deliveryCharges = $this->money($delivered->sum('delivery_charges'));

        return [
            'total_sales' => $totalSales,
            'orders_counted' => $counted->count(),
            'delivery_charges' => $deliveryCharges,
            'total_collected' => $this->money($totalSales + $deliveryCharges),
            'sales_by_type' => $byType,
            'items' => $this->items($counted),
            'delivery_charges_by_area' => $this->chargesBy($delivered, 'delivery_area', 'No area'),
            'delivery_charges_by_rider' => $this->chargesBy($delivered, 'rider_name', 'No rider'),
            'cancelled' => $this->cancelled($orders),
        ];
    }

    /** does this order count as a sale? */
    public function counts(Order $order): bool
    {
        return ! in_array($order->type, self::DELIVERED_ONLY_TYPES, true) || $order->status === self::DELIVERED;
    }

    /** item-wise sales of the counted orders: name, qty, amount (unit_price x qty), amount desc */
    private function items(Collection $orders): array
    {
        return $orders->flatMap->items
            ->groupBy('name')
            ->map(fn ($rows, $name) => [
                'name' => $name,
                'qty' => (int) $rows->sum('qty'),
                'amount' => $this->money($rows->sum(fn ($i) => $i->unit_price * $i->qty)),
            ])
            ->sortByDesc('amount')
            ->values()
            ->all();
    }

    private function chargesBy(Collection $orders, string $field, string $empty): array
    {
        return $orders->groupBy(fn ($o) => $o->{$field} ?: $empty)
            ->map(fn ($rows, $name) => ['name' => $name, 'orders' => $rows->count(), 'amount' => $this->money($rows->sum('delivery_charges'))])
            ->sortByDesc('amount')
            ->values()
            ->all();
    }

    /** cancelled website / home delivery orders (zero when CANCELLED is never used) */
    private function cancelled(Collection $orders): array
    {
        return collect(self::DELIVERED_ONLY_TYPES)->map(function ($type) use ($orders) {
            $rows = $orders->where('type', $type)->where('status', self::CANCELLED);

            return ['type' => $type, 'label' => $type === 'website' ? 'Website' : 'Home Delivery',
                'orders' => $rows->count(), 'amount' => $this->money($rows->sum('total'))];
        })->all();
    }

    private function money($v): float
    {
        return round((float) $v, 2);
    }
}
