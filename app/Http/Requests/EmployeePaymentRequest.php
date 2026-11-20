<?php

namespace App\Http\Requests;

use App\Models\EmployeePayment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A salary payment or an advance (create and update).
 * For a salary the cash amount is calculated on the server (earned - advance_deducted); a sent `amount` is ignored.
 * Outstanding-advance and overlapping-period checks need the database, so they live in EmployeePaymentService.
 */
class EmployeePaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $salary = 'required_if:type,'.EmployeePayment::SALARY;

        return [
            'type' => ['required', 'string', Rule::in(EmployeePayment::TYPES)],
            'payment_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->toDateString()],
            'period_from' => ['nullable', $salary, 'date_format:Y-m-d'],
            'period_to' => ['nullable', $salary, 'date_format:Y-m-d', 'after_or_equal:period_from'],
            'units' => 'nullable|numeric|min:0|max:9999',
            'earned' => ['nullable', $salary, 'numeric', 'gt:0', 'max:9999999999.99'],
            'advance_deducted' => 'nullable|numeric|min:0|max:9999999999.99',
            'amount' => ['nullable', 'required_if:type,'.EmployeePayment::ADVANCE, 'numeric', 'gt:0', 'max:9999999999.99'],
            'payment_method' => ['required', 'string', Rule::in(EmployeePayment::PAYMENT_METHODS)],
            'comment' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'payment_date.before_or_equal' => 'The date cannot be in the future.',
            'period_to.after_or_equal' => 'The period must end on or after its start date.',
            'earned.gt' => 'The earned amount must be greater than 0.',
            'amount.gt' => 'The amount must be greater than 0.',
        ];
    }
}
