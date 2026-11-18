<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReopenDayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['reason' => 'required|string|max:2000'];
    }

    public function messages(): array
    {
        return ['reason.required' => 'Enter a reason for reopening this day.'];
    }
}
