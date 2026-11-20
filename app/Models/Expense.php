<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One extra expense entry. expense_date is kept as a plain Y-m-d string (no date cast),
 * like VendorTransaction, so date filters compare the same on MySQL and SQLite.
 */
class Expense extends Model
{
    public const PAYMENT_METHODS = ['cash', 'bank', 'other'];

    protected $fillable = [
        'expense_category_id', 'expense_date', 'amount', 'payment_method', 'paid_to', 'reference', 'comment', 'created_by',
    ];

    protected $casts = ['amount' => 'float'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
