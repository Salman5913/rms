<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** money paid back on one loan (repayment_date is a plain Y-m-d string, see Loan) */
class LoanRepayment extends Model
{
    public const PAYMENT_METHODS = ['cash', 'bank', 'other'];

    protected $fillable = ['loan_id', 'repayment_date', 'amount', 'payment_method', 'comment', 'created_by'];

    protected $casts = ['amount' => 'float'];

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
