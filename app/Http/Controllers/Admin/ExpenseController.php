<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseListRequest;
use App\Http\Requests\ExpenseRequest;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Services\ExpenseService;

/** expense entries, the by-category report and its print (permission module: expenses) */
class ExpenseController extends Controller
{
    public function __construct(private ExpenseService $expenses) {}

    public function index(ExpenseListRequest $request)
    {
        return response()->json($this->expenses->list($request->validated()));
    }

    public function report(ExpenseListRequest $request)
    {
        return response()->json($this->expenses->report($request->validated()));
    }

    public function print(ExpenseListRequest $request)
    {
        return response()->json($this->expenses->printData($request->validated()));
    }

    /** dropdown + filter list for the expenses page (inactive ones included, the page hides them for new entries).
        Lives under the expenses module so a user doesn't also need the expense-categories permission. */
    public function categories()
    {
        return response()->json(ExpenseCategory::orderBy('name')->get(['id', 'name', 'status']));
    }

    public function store(ExpenseRequest $request)
    {
        $expense = Expense::create($request->validated() + ['created_by' => $request->user()->id]);

        return response()->json($expense->load('category:id,name', 'creator:id,name'), 201);
    }

    public function update(ExpenseRequest $request, $id)
    {
        $expense = Expense::findOrFail($id);
        $expense->update($request->validated());

        return response()->json($expense->load('category:id,name', 'creator:id,name'));
    }

    public function destroy($id)
    {
        Expense::findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }
}
