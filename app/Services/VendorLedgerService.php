<?php

namespace App\Services;

use App\Helpers\DateRangeHelper;
use App\Models\User;
use App\Models\Vendor;
use App\Models\VendorTransaction;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Vendor balances and the per-vendor ledger.
 * Balance = opening balance + purchases - payments (positive = we owe the vendor, negative = advance).
 * Ledger columns (restaurant's books): purchase = credit, payment = debit.
 * Every figure uses transaction_date (the date the user entered), never created_at.
 */
class VendorLedgerService
{
    public const PER_PAGE = 20;

    /** +amount for purchases, -amount for payments */
    private const SIGNED = "CASE WHEN type = 'purchase' THEN amount ELSE -amount END";

    /* ---------------- reusable totals ---------------- */

    /** purchases (stock received) between two dates, both inclusive; null = unbounded. Used by Profit & Loss. */
    public function purchasesTotal(?string $from = null, ?string $to = null): float
    {
        $q = DB::table('vendor_transactions')->where('type', VendorTransaction::PURCHASE);
        $this->between($q, $from, $to);

        return round((float) $q->sum('amount'), 2);
    }

    /** grand totals across all vendors (not affected by the list search) */
    public function vendorTotals(): array
    {
        $row = DB::query()->fromSub(Vendor::query()->withBalance()->toBase(), 'v')->selectRaw(
            'COALESCE(SUM(total_purchases), 0) as total_purchases, COALESCE(SUM(total_payments), 0) as total_payments,'
            .' COALESCE(SUM(balance), 0) as balance,'
            .' COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) as total_owed,'
            .' COALESCE(SUM(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0) as total_advance'
        )->first();

        return collect((array) $row)->map(fn ($v) => round((float) $v, 2))->all();
    }

    /* ---------------- ledger ---------------- */

    /** resolves ?range= (quick filter) or ?from=&to= (custom) to [preset, from, to] */
    public function resolveRange(array $filters): array
    {
        $preset = $filters['range'] ?? null;
        if ($preset && $preset !== 'custom') {
            return ['preset' => $preset] + DateRangeHelper::forPreset($preset);
        }

        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        return ['preset' => $from || $to ? 'custom' : 'all', 'from' => $from, 'to' => $to];
    }

    /**
     * The ledger of one vendor for a date range.
     * Running balances are computed over the vendor's whole history with a window function
     * (SUM() OVER), *then* the range and search filters are applied, so every row shows the real
     * ledger balance at that point, on every page and while searching.
     */
    public function ledger(Vendor $vendor, array $filters): array
    {
        ['preset' => $preset, 'from' => $from, 'to' => $to] = $this->resolveRange($filters);
        $search = trim((string) ($filters['search'] ?? ''));

        $opening = $this->balanceBefore($vendor, $from);
        $rangeTotals = $this->totals($this->rangeQuery($vendor, $from, $to));

        // oldest first, so the balance reads down from the opening balance to the closing balance
        $rows = $this->rowsQuery($vendor, $from, $to, $search)
            ->orderBy('transaction_date')->orderBy('id');

        // the window sums from the very first entry, so it starts at the vendor's own opening balance
        $toRow = fn ($r) => $this->row($r, (float) $vendor->opening_balance);
        $rows = ! empty($filters['all'])
            ? ['data' => $rows->get()->map($toRow)->all()]
            : $rows->paginate(self::PER_PAGE, ['*'], 'page', (int) ($filters['page'] ?? 1))->through($toRow);

        $matched = null;
        if ($search !== '') {
            $matched = $this->totals($this->search($this->rangeQuery($vendor, $from, $to), $search));
        }

        return [
            'restaurant' => config('app.name'),
            'vendor' => $this->vendorInfo($vendor),
            'range' => ['preset' => $preset, 'from' => $from, 'to' => $to],
            'search' => $search,
            'opening_balance_for_range' => $opening,
            'rows' => $rows,
            'totals' => $rangeTotals + ['closing_balance' => round($opening + $rangeTotals['credit'] - $rangeTotals['debit'], 2)],
            'matched_totals' => $matched,
        ];
    }

    /** vendor.opening_balance + purchases - payments dated before $from (whole ledger when no $from) */
    public function balanceBefore(Vendor $vendor, ?string $from): float
    {
        $change = 0.0;
        if ($from) {
            $change = (float) DB::table('vendor_transactions')->where('vendor_id', $vendor->id)
                ->where('transaction_date', '<', $from)
                ->sum(DB::raw(self::SIGNED));
        }

        return round((float) $vendor->opening_balance + $change, 2);
    }

    /** opening balance + every purchase - every payment */
    public function currentBalance(Vendor $vendor): float
    {
        $change = (float) DB::table('vendor_transactions')->where('vendor_id', $vendor->id)->sum(DB::raw(self::SIGNED));

        return round((float) $vendor->opening_balance + $change, 2);
    }

    /**
     * Everything a printed receipt needs: the entry, its vendor, who entered it and the vendor's
     * balance just before / after it (ledger order: transaction_date, then id).
     */
    public function receipt(VendorTransaction $tx): array
    {
        $vendor = $tx->vendor;
        $before = (float) DB::table('vendor_transactions')->where('vendor_id', $vendor->id)
            ->where(fn ($q) => $q->where('transaction_date', '<', $tx->transaction_date)
                ->orWhere(fn ($qq) => $qq->where('transaction_date', $tx->transaction_date)->where('id', '<', $tx->id)))
            ->sum(DB::raw(self::SIGNED));
        $before = round((float) $vendor->opening_balance + $before, 2);
        $signed = $tx->type === VendorTransaction::PURCHASE ? $tx->amount : -$tx->amount;

        return [
            'restaurant' => config('app.name'),
            'transaction' => $tx->only(['id', 'type', 'transaction_date', 'amount', 'reference', 'payment_method', 'comment', 'source', 'created_at'])
                + ['created_by' => $tx->creator?->name],
            'vendor' => $vendor->only(['id', 'name', 'phone', 'company', 'address']),
            'balance_before' => $before,
            'balance_after' => round($before + $signed, 2),
            'current_balance' => $this->currentBalance($vendor),
        ];
    }

    /* ---------------- transactions ---------------- */

    public function addTransaction(Vendor $vendor, array $data, User $user): VendorTransaction
    {
        if (! $vendor->status) {
            throw ValidationException::withMessages(['vendor' => 'This vendor is inactive. Activate it before adding new entries.']);
        }

        return $vendor->transactions()->create($this->clean($data) + [
            'source' => VendorTransaction::SOURCE_MANUAL,
            'created_by' => $user->id,
        ]);
    }

    public function updateTransaction(VendorTransaction $tx, array $data): VendorTransaction
    {
        $this->assertManual($tx, 'edited');
        $tx->update($this->clean($data));

        return $tx;
    }

    public function deleteTransaction(VendorTransaction $tx): void
    {
        $this->assertManual($tx, 'deleted');
        $tx->delete();
    }

    /** vendors with ledger entries can't be deleted (deactivate them instead) */
    public function assertDeletable(array $vendorIds): void
    {
        $used = Vendor::whereIn('id', $vendorIds)->whereHas('transactions')->pluck('name');
        if ($used->isNotEmpty()) {
            throw ValidationException::withMessages([
                'vendor' => 'Vendors with purchases or payments cannot be deleted. Deactivate them instead: '.$used->join(', ').'.',
            ]);
        }
    }

    /* ---------------- internals ---------------- */

    private function vendorInfo(Vendor $vendor): array
    {
        return $vendor->only(['id', 'name', 'phone', 'company', 'address', 'status', 'opening_balance'])
            + ['balance' => $this->currentBalance($vendor)];
    }

    /** the range's rows with their running balance (window function over the whole ledger up to $to) */
    private function rowsQuery(Vendor $vendor, ?string $from, ?string $to, string $search): Builder
    {
        $withRunning = DB::table('vendor_transactions')->where('vendor_id', $vendor->id)
            ->when($to, fn ($q) => $q->where('transaction_date', '<=', $to))
            ->select('*')
            ->selectRaw('SUM('.self::SIGNED.') OVER (ORDER BY transaction_date, id ROWS UNBOUNDED PRECEDING) as running_change');

        $q = DB::query()->fromSub($withRunning, 'l')
            ->when($from, fn ($q) => $q->where('transaction_date', '>=', $from));

        return $search === '' ? $q : $this->search($q, $search);
    }

    private function rangeQuery(Vendor $vendor, ?string $from, ?string $to): Builder
    {
        return $this->between(DB::table('vendor_transactions')->where('vendor_id', $vendor->id), $from, $to);
    }

    private function between(Builder $q, ?string $from, ?string $to): Builder
    {
        return $q->when($from, fn ($q) => $q->where('transaction_date', '>=', $from))
            ->when($to, fn ($q) => $q->where('transaction_date', '<=', $to));
    }

    private function search(Builder $q, string $search): Builder
    {
        return $q->where(fn ($qq) => $qq->where('comment', 'like', "%{$search}%")->orWhere('reference', 'like', "%{$search}%"));
    }

    /** debit (payments), credit (purchases) and row count of a query */
    private function totals(Builder $q): array
    {
        $t = $q->selectRaw(
            "COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) as debit,"
            ." COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) as credit, COUNT(*) as count"
        )->first();

        return ['debit' => round((float) $t->debit, 2), 'credit' => round((float) $t->credit, 2), 'count' => (int) $t->count];
    }

    private function row(object $r, float $vendorOpening): array
    {
        $amount = round((float) $r->amount, 2);

        return [
            'id' => $r->id,
            'date' => substr((string) $r->transaction_date, 0, 10),
            'type' => $r->type,
            'reference' => $r->reference,
            'payment_method' => $r->payment_method,
            'comment' => $r->comment,
            'source' => $r->source,
            'debit' => $r->type === VendorTransaction::PAYMENT ? $amount : 0.0,
            'credit' => $r->type === VendorTransaction::PURCHASE ? $amount : 0.0,
            'running_balance' => round($vendorOpening + (float) $r->running_change, 2),
        ];
    }

    /** fillable ledger fields; purchases never keep a payment method */
    private function clean(array $data): array
    {
        $f = collect($data)->only(['type', 'transaction_date', 'amount', 'reference', 'payment_method', 'comment'])->all();
        if (($f['type'] ?? null) !== VendorTransaction::PAYMENT) {
            $f['payment_method'] = null;
        }

        return $f;
    }

    private function assertManual(VendorTransaction $tx, string $verb): void
    {
        if ($tx->source === VendorTransaction::SOURCE_CHAI) {
            throw ValidationException::withMessages(['source' => "Chai entries are managed from the Chai module and cannot be {$verb} here."]);
        }
    }
}
