<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One vendor ledger entry. Restaurant's books (the vendor is a creditor):
 * purchase = credit (we owe more), payment = debit (we owe less).
 * transaction_date is kept as a plain Y-m-d string (no date cast) so range filters compare the same
 * on MySQL and SQLite.
 */
class VendorTransaction extends Model
{
    public const PURCHASE = 'purchase';

    public const PAYMENT = 'payment';

    public const TYPES = [self::PURCHASE, self::PAYMENT];

    public const PAYMENT_METHODS = ['cash', 'bank', 'other'];

    public const SOURCE_MANUAL = 'manual';

    /** created by the Chai module; managed there, not from the vendor ledger */
    public const SOURCE_CHAI = 'chai';

    protected $fillable = [
        'vendor_id', 'type', 'transaction_date', 'amount', 'reference', 'payment_method', 'comment', 'source', 'created_by',
    ];

    protected $casts = ['amount' => 'float'];

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
