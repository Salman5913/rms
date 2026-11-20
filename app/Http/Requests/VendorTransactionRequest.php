<?php

namespace App\Http\Requests;

use App\Models\VendorTransaction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** a purchase or payment entered on the vendor ledger (create and update) */
class VendorTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(VendorTransaction::TYPES)],
            'transaction_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->toDateString()],
            'amount' => 'required|numeric|gt:0|max:9999999999.99',
            'reference' => 'nullable|string|max:100',
            'payment_method' => [
                'nullable', 'string', Rule::in(VendorTransaction::PAYMENT_METHODS),
                'prohibited_unless:type,'.VendorTransaction::PAYMENT,
            ],
            'comment' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'transaction_date.before_or_equal' => 'The date cannot be in the future.',
            'amount.gt' => 'The amount must be greater than 0.',
            'payment_method.prohibited_unless' => 'A payment method can only be set on payments.',
        ];
    }
}
