<?php

namespace App\Services;

use App\Helpers\DateRangeHelper;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Extra expenses: the list, the by-category report, the print data and the total used by Profit & Loss.
 * List, report and print all start from filteredQuery(), so their figures always match.
 * Every total is a SUM / COUNT in the database; dates are compared on expense_date directly (index friendly).
 */
class ExpenseService
{
    public const PER_PAGE = 20;

    /** the print endpoint returns at most this many rows */
    public const PRINT_LIMIT = 5000;

    /** columns the screen and the print use */
    private const COLUMNS = [
        'id', 'expense_category_id', 'expense_date', 'amount', 'payment_method', 'paid_to', 'reference', 'comment', 'created_by',
    ];

    /** total expenses between two dates (both inclusive; null = unbounded). Used by Profit & Loss. */
    public function totalForRange(?string $from = null, ?string $to = null): float
    {
        $q = DB::table('expenses');
        $this->between($q, $from, $to);

        return round((float) $q->sum('amount'), 2);
    }

    /** one page of entries (newest first) plus count / total of the WHOLE filtered range */
    public function list(array $filters): array
    {
        $totals = $this->totals($this->filteredQuery($filters));

        // the totals already counted the rows, so pass that count to paginate() and skip its own COUNT query
        $page = $this->rowsQuery($filters)
            ->paginate(self::PER_PAGE, self::COLUMNS, 'page', (int) ($filters['page'] ?? 1), $totals['count']);

        return $page->toArray() + ['range' => $this->resolveRange($filters), 'totals' => $totals];
    }

    /** per-category count / total (biggest first) and the grand total */
    public function report(array $filters): array
    {
        $categories = $this->categoryTotals($filters);

        return [
            'range' => $this->resolveRange($filters),
            'categories' => $categories,
            'totals' => [
                'count' => array_sum(array_column($categories, 'count')),
                'total' => round(array_sum(array_column($categories, 'total')), 2),
            ],
        ];
    }

    /** everything the A4 print needs: the report plus every entry of the range (capped at PRINT_LIMIT) */
    public function printData(array $filters): array
    {
        // one extra row tells us whether the cap was hit
        $rows = $this->rowsQuery($filters)->limit(self::PRINT_LIMIT + 1)->get(self::COLUMNS);
        $capped = $rows->count() > self::PRINT_LIMIT;

        return $this->report($filters) + [
            'restaurant' => config('app.name'),
            'rows' => $rows->take(self::PRINT_LIMIT)->values(),
            'capped' => $capped,
            'limit' => self::PRINT_LIMIT,
        ];
    }

    /** ONE grouped query for count / sum per category, then one small query for the category names */
    public function categoryTotals(array $filters): array
    {
        $groups = $this->filteredQuery($filters)->toBase()
            ->select('expense_category_id')
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as total')
            ->groupBy('expense_category_id')
            ->orderByDesc('total')
            ->get();

        $names = ExpenseCategory::whereIn('id', $groups->pluck('expense_category_id'))->pluck('name', 'id');
        $grand = (float) $groups->sum('total');

        return $groups->map(fn ($g) => [
            'id' => (int) $g->expense_category_id,
            'name' => $names[$g->expense_category_id] ?? '',
            'count' => (int) $g->count,
            'total' => round((float) $g->total, 2),
            'percent' => $grand > 0 ? round((float) $g->total / $grand * 100, 1) : 0.0,
        ])->all();
    }

    /** ?preset= (DateRangeHelper) or ?preset=custom with from / to; nothing given = all dates */
    public function resolveRange(array $filters): array
    {
        $preset = $filters['preset'] ?? null;
        if ($preset && $preset !== 'custom') {
            return ['preset' => $preset] + DateRangeHelper::forPreset($preset);
        }

        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        return ['preset' => $from || $to ? 'custom' : 'all', 'from' => $from, 'to' => $to];
    }

    /** the date range, category and search filters - shared by the list, the report and the print */
    public function filteredQuery(array $filters): Builder
    {
        $range = $this->resolveRange($filters);
        $search = trim((string) ($filters['search'] ?? ''));

        $q = Expense::query();
        $this->between($q, $range['from'], $range['to']);

        return $q->when($filters['category_id'] ?? null, fn ($q, $id) => $q->where('expense_category_id', $id))
            ->when($search !== '', fn ($q) => $q->where(fn ($qq) => $qq
                ->where('comment', 'like', "%{$search}%")
                ->orWhere('paid_to', 'like', "%{$search}%")
                ->orWhere('reference', 'like', "%{$search}%")));
    }

    /** a category with expenses can't be deleted (deactivate it instead) */
    public function assertCategoriesDeletable(array $categoryIds): void
    {
        if (Expense::whereIn('expense_category_id', $categoryIds)->exists()) {
            throw ValidationException::withMessages([
                'category' => 'A category with expenses cannot be deleted. Deactivate it instead.',
            ]);
        }
    }

    /* ---------------- internals ---------------- */

    /** filtered rows, newest first, with the category and entered-by names */
    private function rowsQuery(array $filters): Builder
    {
        return $this->filteredQuery($filters)
            ->with(['category:id,name', 'creator:id,name'])
            ->orderByDesc('expense_date')->orderByDesc('id');
    }

    /** count and total amount of a filtered query */
    private function totals(Builder $q): array
    {
        $row = $q->toBase()->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as total')->first();

        return ['count' => (int) $row->count, 'total' => round((float) $row->total, 2)];
    }

    /** whereBetween on the plain column (no DATE() around it, so the index is used); open ends use >= / <= */
    private function between($q, ?string $from, ?string $to): void
    {
        if ($from && $to) {
            $q->whereBetween('expense_date', [$from, $to]);
        } elseif ($from) {
            $q->where('expense_date', '>=', $from);
        } elseif ($to) {
            $q->where('expense_date', '<=', $to);
        }
    }
}
