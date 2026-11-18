<?php

namespace App\Http\Requests;

use App\Models\Labour;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class LabourRequest extends FormRequest
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
            'cnic' => 'nullable|string|max:50',
            'user_type' => ['required', 'string', Rule::in(Labour::USER_TYPES)],
            'pay_type' => ['required', 'string', Rule::in(Labour::PAY_TYPES)],
            'pay_rate' => 'nullable|numeric|min:0',
            'status' => 'nullable|boolean',
        ];
    }
}
