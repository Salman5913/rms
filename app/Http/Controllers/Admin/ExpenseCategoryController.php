<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\ExpenseCategoryRequest;
use App\Models\ExpenseCategory;
use App\Services\ExpenseService;
use Illuminate\Http\Request;

/** expense categories (permission module: expense-categories) */
class ExpenseCategoryController extends ApiCrudController
{
    protected string $model = ExpenseCategory::class;

    protected array $search = ['name'];

    public function __construct(private ExpenseService $expenses) {}

    public function destroy($id)
    {
        $this->expenses->assertCategoriesDeletable([ExpenseCategory::findOrFail($id)->id]);

        return parent::destroy($id);
    }

    public function bulkDelete(Request $request)
    {
        $this->expenses->assertCategoriesDeletable($request->validate(['ids' => 'required|array'])['ids']);

        return parent::bulkDelete($request);
    }

    /** list rows get entries, amount and percent (share of all expenses), all calculated in SQL (all dates) */
    protected function filter($query, Request $request): void
    {
        $query->withCount('expenses as entries')
            ->withSum('expenses as amount', 'amount')
            ->selectRaw(
                'ROUND(COALESCE((SELECT SUM(amount) FROM expenses WHERE expenses.expense_category_id = expense_categories.id), 0) * 100.0'
                .' / NULLIF((SELECT SUM(amount) FROM expenses), 0), 1) as percent'
            );
    }

    protected function rules(Request $request, $model = null): array
    {
        return (new ExpenseCategoryRequest)->rules($model?->id);
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['status'] = $data['status'] ?? true;

        return $f;
    }

    protected function syncRelations($model, array $data): void {}
}
