<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A salary payment or an advance given to an employee.
 * amount = cash paid (net for a salary). Dates are kept as plain Y-m-d strings (no date cast) so range
 * filters compare the same on MySQL and SQLite.
 */
class EmployeePayment extends Model
{
    public const SALARY = 'salary';

    public const ADVANCE = 'advance';

    public const TYPES = [self::SALARY, self::ADVANCE];

    public const PAYMENT_METHODS = ['cash', 'bank', 'other'];

    protected $fillable = [
        'employee_id', 'type', 'payment_date', 'period_from', 'period_to', 'units',
        'earned', 'advance_deducted', 'amount', 'payment_method', 'comment', 'created_by',
    ];

    protected $casts = [
        'units' => 'float',
        'earned' => 'float',
        'advance_deducted' => 'float',
        'amount' => 'float',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
