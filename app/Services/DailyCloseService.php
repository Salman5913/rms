<?php

namespace App\Services;

use App\Exceptions\DailyCloseException;
use App\Models\DailyClose;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Closing / reopening a business day and the order lock that comes with it.
 * An order is locked when its created_at date has an active close and it was created
 * at or before that close (orders placed afterwards, e.g. from the website, stay editable).
 */
class DailyCloseService
{
    public const LOCKED_MESSAGE = 'This day is closed. Reopen it to make changes.';

    public function __construct(private SalesReportService $sales) {}

    /** the active close of a date, if any */
    public function activeClose(string $date): ?DailyClose
    {
        return DailyClose::active()->forDate($date)->latest('id')->first();
    }

    /** the latest close row of a date (closed or reopened), if any */
    public function latestClose(string $date): ?DailyClose
    {
        return DailyClose::forDate($date)->latest('id')->first();
    }

    /** website / home delivery orders of the date that are neither delivered nor cancelled */
    public function blockingOrders(string $date): Collection
    {
        return $this->ordersOf($date)
            ->whereIn('type', SalesReportService::DELIVERED_ONLY_TYPES)
            ->whereNotIn('status', [SalesReportService::DELIVERED, SalesReportService::CANCELLED])
            ->orderBy('id')
            ->get(['id', 'order_number', 'type', 'status']);
    }

    /** orders of a closed date that were created after the close (not part of the snapshot) */
    public function placedAfterClose(string $date, ?DailyClose $close): Collection
    {
        if (! $close || $close->status !== DailyClose::STATUS_CLOSED) {
            return collect();
        }

        return $this->ordersOf($date)->where('created_at', '>', $close->closed_at)
            ->orderBy('id')->get(['id', 'order_number', 'type', 'status', 'total', 'created_at']);
    }

    public function close(string $date, User $user, ?float $cashCounted, ?string $notes): DailyClose
    {
        return DB::transaction(function () use ($date, $user, $cashCounted, $notes) {
            // lock the date's rows so two cashiers can't close the same day at once
            if (DailyClose::active()->forDate($date)->lockForUpdate()->exists()) {
                throw new DailyCloseException('This day is already closed.');
            }

            $blocking = $this->blockingOrders($date);
            if ($blocking->isNotEmpty()) {
                throw new DailyCloseException(
                    'Some website or home delivery orders of this day are still pending. Mark them Delivered or Cancelled before closing.',
                    ['blocking_orders' => $blocking->values()->all()]
                );
            }

            return DailyClose::create([
                'business_date' => $date,
                'status' => DailyClose::STATUS_CLOSED,
                'closed_by' => $user->id,
                'closed_at' => now(),
                'summary' => $this->sales->forDate($date),
                'cash_counted' => $cashCounted,
                'notes' => $notes,
            ]);
        });
    }

    public function reopen(DailyClose $close, User $user, string $reason): DailyClose
    {
        if ($close->status !== DailyClose::STATUS_CLOSED) {
            throw new DailyCloseException('This day is not closed.');
        }

        $close->update([
            'status' => DailyClose::STATUS_REOPENED,
            'reopened_by' => $user->id,
            'reopened_at' => now(),
            'reopen_reason' => $reason,
        ]);

        return $close;
    }

    public function isLocked(Order $order): bool
    {
        $close = $this->activeClose($order->created_at->toDateString());

        return $close && $order->created_at->lte($close->closed_at);
    }

    /** 422 when any of the orders belongs to a closed day */
    public function ensureUnlocked(Order|Collection $orders): void
    {
        foreach ($orders instanceof Order ? [$orders] : $orders as $order) {
            if ($this->isLocked($order)) {
                throw new DailyCloseException(self::LOCKED_MESSAGE, ['order_number' => $order->order_number]);
            }
        }
    }

    /** 422 while today is closed (admin order creation) */
    public function ensureTodayOpen(): void
    {
        if ($this->activeClose(now()->toDateString())) {
            throw new DailyCloseException('Today is closed. Reopen it to add orders.');
        }
    }

    private function ordersOf(string $date)
    {
        $day = Carbon::parse($date);

        return Order::whereBetween('created_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()]);
    }
}
