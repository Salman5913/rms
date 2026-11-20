<?php

namespace App\Http\Requests;

use App\Models\Employee;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class EmployeeRequest extends FormRequest
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
            'user_type' => ['required', 'string', Rule::in(Employee::USER_TYPES)],
            'user_type_other' => ['nullable', 'required_if:user_type,'.Employee::OTHER_TYPE, 'string', 'max:100'],
            'pay_type' => ['required', 'string', Rule::in(Employee::PAY_TYPES)],
            'pay_rate' => 'nullable|numeric|min:0',
            'status' => 'nullable|boolean',
        ];
    }

    public function messages(): array
    {
        return ['user_type_other.required_if' => 'Enter the employee type when the type is Other.'];
    }
}
