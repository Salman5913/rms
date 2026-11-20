<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** period (and optionally the units the user typed) for the "Pay salary" suggestion */
class SalarySuggestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'period_from' => ['required', 'date_format:Y-m-d'],
            'period_to' => ['required', 'date_format:Y-m-d', 'after_or_equal:period_from'],
            'units' => 'nullable|numeric|min:0|max:9999',
            // editing a payment: leave it out of the outstanding advance and the overlap check
            'payment_id' => 'nullable|integer',
        ];
    }
}
