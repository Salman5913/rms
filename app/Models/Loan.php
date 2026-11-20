<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Money the restaurant borrowed. loan_date is kept as a plain Y-m-d string (no date cast),
 * like VendorTransaction, so date filters compare the same on MySQL and SQLite.
 */
class Loan extends Model
{
    /** calculated status (see LoanService): something is still owed / fully repaid */
    public const ACTIVE = 'active';

    public const PAID = 'paid';

    public const STATUSES = [self::ACTIVE, self::PAID];

    protected $fillable = ['lender_name', 'lender_phone', 'loan_date', 'amount', 'reference', 'comment', 'created_by'];

    protected $casts = ['amount' => 'float'];

    public function repayments(): HasMany
    {
        return $this->hasMany(LoanRepayment::class);
    }
}
