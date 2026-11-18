<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CloseDayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->toDateString()],
            'cash_counted' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return ['date.before_or_equal' => 'A future date cannot be closed.'];
    }
}
