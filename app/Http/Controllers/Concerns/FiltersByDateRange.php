<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Limits an export query to records created between ?from=YYYY-MM-DD and ?to=YYYY-MM-DD
 * (both days inclusive). Either bound may be left out.
 */
trait FiltersByDateRange
{
    protected function applyDateRange(Builder $query, Request $request, string $column = 'created_at'): Builder
    {
        $range = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        if (! empty($range['from'])) {
            $query->where($column, '>=', Carbon::parse($range['from'])->startOfDay());
        }
        if (! empty($range['to'])) {
            $query->where($column, '<=', Carbon::parse($range['to'])->endOfDay());
        }

        return $query;
    }

    /** "Products_2026-11-01_to_2026-11-15.csv" */
    protected function exportFileName(string $base, Request $request): string
    {
        $from = $request->query('from');
        $to = $request->query('to');

        return $base.($from || $to ? '_'.($from ?: 'start').'_to_'.($to ?: 'today') : '').'.csv';
    }
}
