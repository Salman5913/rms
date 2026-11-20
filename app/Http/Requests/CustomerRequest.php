<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** $ignoreId = the customer being edited (their own phone is not a duplicate) */
    public function rules(?int $ignoreId = null): array
    {
        return [
            'name' => 'required|string|max:255',
            'phone' => ['required', 'string', 'max:50', Rule::unique('customers', 'phone')->ignore($ignoreId)],
            'address' => 'nullable|string|max:1000',
            'delivery_area_id' => 'nullable|integer|exists:delivery_areas,id',
        ];
    }

    public function messages(): array
    {
        return ['phone.unique' => 'A customer with this phone number already exists.'];
    }
}
