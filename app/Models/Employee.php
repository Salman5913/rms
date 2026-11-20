<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class Employee extends Model
{
    public const USER_TYPES = ['rider', 'cook', 'waiter', 'cleaner', 'manager', 'other'];

    public const PAY_TYPES = ['monthly', 'weekly', 'daily'];

    /** user_type_other: the typed type, only kept when user_type = "other" */
    public const OTHER_TYPE = 'other';

    protected $fillable = ['name', 'phone', 'cnic', 'user_type', 'user_type_other', 'pay_type', 'pay_rate', 'status'];

    protected $casts = [
        'status' => 'boolean',
        // only present when loaded with withPaymentSummary()
        'outstanding_advance' => 'float',
    ];

    public function payments(): HasMany
    {
        return $this->hasMany(EmployeePayment::class);
    }

    /** adds outstanding_advance (advances - deductions) and last_salary_date (latest salary payment_date) via sub-queries */
    public function scopeWithPaymentSummary(Builder $q): Builder
    {
        if (is_null($q->getQuery()->columns)) {
            $q->select('employees.*');
        }
        $payments = fn () => EmployeePayment::query()->toBase()->whereColumn('employee_payments.employee_id', 'employees.id');

        return $q
            ->selectSub($payments()->selectRaw(
                "COALESCE(SUM(CASE WHEN type = 'advance' THEN amount ELSE 0 END), 0) - COALESCE(SUM(advance_deducted), 0)"
            ), 'outstanding_advance')
            ->selectSub($payments()->where('type', EmployeePayment::SALARY)->selectRaw('MAX(payment_date)'), 'last_salary_date');
    }

    /** active employees of type rider (the ones delivery orders can be assigned to) */
    public function scopeActiveRiders(Builder $q): Builder
    {
        return $q->where('user_type', 'rider')->where('status', true);
    }

    /** validation rule: the id belongs to an active rider */
    public static function activeRiderRule(): Exists
    {
        return Rule::exists('employees', 'id')->where('user_type', 'rider')->where('status', true);
    }
}
