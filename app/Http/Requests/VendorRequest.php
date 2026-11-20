<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class VendorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:50',
            'company' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:255',
            // negative = we had already paid the vendor in advance
            'opening_balance' => 'nullable|numeric|between:-9999999999.99,9999999999.99',
            'status' => 'nullable|boolean',
            'notes' => 'nullable|string|max:2000',
        ];
    }
}
