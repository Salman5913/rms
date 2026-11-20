<?php

namespace App\Helpers;

use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * Quick report ranges -> [from, to] as Y-m-d (both inclusive). Weeks start on Monday.
 * Ranges end today (there are no future transactions); "all" has no bounds.
 */
class DateRangeHelper
{
    public const PRESETS = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'all'];

    /** @return array{from: ?string, to: ?string} */
    public static function forPreset(string $preset, ?Carbon $today = null): array
    {
        $today = ($today ?? Carbon::today())->copy()->startOfDay();

        [$from, $to] = match ($preset) {
            'today' => [$today, $today],
            'yesterday' => [$today->copy()->subDay(), $today->copy()->subDay()],
            'this_week' => [$today->copy()->startOfWeek(Carbon::MONDAY), $today],
            'this_month' => [$today->copy()->startOfMonth(), $today],
            'this_year' => [$today->copy()->startOfYear(), $today],
            'all' => [null, null],
            default => throw new InvalidArgumentException("Unknown date range [$preset]."),
        };

        return ['from' => $from?->toDateString(), 'to' => $to?->toDateString()];
    }
}
