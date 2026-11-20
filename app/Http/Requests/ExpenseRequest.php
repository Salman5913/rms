<?php

namespace App\Http\Requests;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** an expense entry (create and update) */
class ExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // when editing, the entry may keep its current category even if that category was deactivated since
        $currentCategoryId = $this->route('id')
            ? Expense::whereKey($this->route('id'))->value('expense_category_id')
            : null;

        return [
            'expense_category_id' => [
                'bail', 'required', 'integer', Rule::exists('expense_categories', 'id'),
                function (string $attribute, mixed $value, Closure $fail) use ($currentCategoryId) {
                    if ((int) $value !== $currentCategoryId && ! ExpenseCategory::whereKey($value)->where('status', true)->exists()) {
                        $fail('This category is inactive. Choose an active category.');
                    }
                },
            ],
            'expense_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.now()->toDateString()],
            'amount' => 'required|numeric|gt:0|max:9999999999.99',
            'payment_method' => ['required', 'string', Rule::in(Expense::PAYMENT_METHODS)],
            'paid_to' => 'nullable|string|max:255',
            'reference' => 'nullable|string|max:100',
            'comment' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'expense_date.before_or_equal' => 'The date cannot be in the future.',
            'amount.gt' => 'The amount must be greater than 0.',
        ];
    }

    public function attributes(): array
    {
        return ['expense_category_id' => 'category', 'comment' => 'description'];
    }
}
