<?php

namespace App\Http\Requests;

use App\Helpers\DateRangeHelper;
use App\Models\Loan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** loan list filters: a quick range or a custom from / to (on loan_date), status and search */
class LoanListRequest extends FormRequest
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
            'status' => ['nullable', 'string', Rule::in(Loan::STATUSES)],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
