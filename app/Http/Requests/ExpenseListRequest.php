<?php

namespace App\Http\Requests;

use App\Helpers\DateRangeHelper;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** expense list / report / print filters: a quick preset or a custom from / to, category and search */
class ExpenseListRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'preset' => ['nullable', 'string', Rule::in([...DateRangeHelper::PRESETS, 'custom'])],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'category_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
