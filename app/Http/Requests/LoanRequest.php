<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** a loan (create and update). "Amount not below what's repaid" needs the database, so it lives in LoanService. */
class LoanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'lender_name' => 'required|string|max:255',
            'lender_phone' => 'nullable|string|max:50',
            'loan_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->toDateString()],
            'amount' => 'required|numeric|gt:0|max:9999999999.99',
            'reference' => 'nullable|string|max:100',
            'comment' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'loan_date.before_or_equal' => 'The loan date cannot be in the future.',
            'amount.gt' => 'The amount must be greater than 0.',
        ];
    }
}
