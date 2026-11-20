<?php

namespace App\Http\Requests;

use App\Models\LoanRepayment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A repayment on a loan (create and update).
 * "Not more than remaining" and "not before the loan date" need the loan, so they live in LoanService.
 */
class LoanRepaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'repayment_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->toDateString()],
            'amount' => 'required|numeric|gt:0|max:9999999999.99',
            'payment_method' => ['required', 'string', Rule::in(LoanRepayment::PAYMENT_METHODS)],
            'comment' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'repayment_date.before_or_equal' => 'The date cannot be in the future.',
            'amount.gt' => 'The amount must be greater than 0.',
        ];
    }
}
