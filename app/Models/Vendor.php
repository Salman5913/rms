<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Query\Builder as QueryBuilder;

class Vendor extends Model
{
    /** list filter ?balance=: owed = we owe the vendor (balance > 0), advance = paid in advance (balance < 0) */
    public const BALANCE_OWED = 'owed';

    public const BALANCE_ADVANCE = 'advance';

    public const BALANCE_FILTERS = [self::BALANCE_OWED, self::BALANCE_ADVANCE];

    protected $fillable = ['name', 'phone', 'company', 'address', 'opening_balance', 'status', 'notes'];

    protected $casts = [
        'status' => 'boolean',
        'opening_balance' => 'float',
        // only present when loaded with withBalance()
        'total_purchases' => 'float',
        'total_payments' => 'float',
        'balance' => 'float',
    ];

    public function transactions(): HasMany
    {
        return $this->hasMany(VendorTransaction::class);
    }

    /**
     * Adds total_purchases, total_payments and balance (opening + purchases - payments) columns,
     * computed with SQL sub-queries (no transactions are loaded).
     */
    public function scopeWithBalance(Builder $q): Builder
    {
        if (is_null($q->getQuery()->columns)) {
            $q->select('vendors.*');
        }
        [$balance, $bindings] = self::balanceSql();

        return $q->selectSub(self::sumOf(VendorTransaction::PURCHASE), 'total_purchases')
            ->selectSub(self::sumOf(VendorTransaction::PAYMENT), 'total_payments')
            ->selectRaw("$balance as balance", $bindings);
    }

    /** vendors whose balance is owed (> 0) or an advance (< 0); a select alias can't be used in WHERE, so the expression is repeated */
    public function scopeWhereBalance(Builder $q, string $filter): Builder
    {
        [$balance, $bindings] = self::balanceSql();

        return $q->whereRaw("$balance ".($filter === self::BALANCE_ADVANCE ? '<' : '>').' 0', $bindings);
    }

    /** "opening + purchases - payments" as SQL (correlated to vendors.id) with its bindings */
    private static function balanceSql(): array
    {
        $purchases = self::sumOf(VendorTransaction::PURCHASE);
        $payments = self::sumOf(VendorTransaction::PAYMENT);

        return [
            "(vendors.opening_balance + ({$purchases->toSql()}) - ({$payments->toSql()}))",
            [...$purchases->getBindings(), ...$payments->getBindings()],
        ];
    }

    private static function sumOf(string $type): QueryBuilder
    {
        return VendorTransaction::query()->toBase()
            ->selectRaw('COALESCE(SUM(amount), 0)')
            ->whereColumn('vendor_transactions.vendor_id', 'vendors.id')
            ->where('type', $type);
    }
}
