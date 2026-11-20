<?php

namespace App\Http\Requests;

use App\Helpers\DateRangeHelper;
use App\Models\EmployeePayment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** employee ledger / payroll filters: a quick preset or a custom from / to, type, comment search (+ employee on payroll) */
class EmployeeLedgerRequest extends FormRequest
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
            'type' => ['nullable', 'string', Rule::in(EmployeePayment::TYPES)],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'all' => ['nullable', 'boolean'],
        ];
    }
}
