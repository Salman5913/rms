<?php

namespace App\Http\Requests;

use App\Helpers\DateRangeHelper;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** ledger filters: a quick range (today, this_week, ...) or a custom from / to, plus search */
class VendorLedgerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'range' => ['nullable', 'string', Rule::in([...DateRangeHelper::PRESETS, 'custom'])],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'all' => ['nullable', 'boolean'],
        ];
    }
}
