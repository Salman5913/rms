<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\LoanListRequest;
use App\Http\Requests\LoanRequest;
use App\Models\Loan;
use App\Services\LoanService;
use Illuminate\Http\Request;

/** business loans (permission module: loans). show / all come from ApiCrudController. */
class LoanController extends ApiCrudController
{
    protected string $model = Loan::class;

    public function __construct(private LoanService $loans) {}

    /** the list needs repaid / remaining / status per loan and the filtered totals, so it is built in LoanService */
    public function index(Request $request)
    {
        return response()->json($this->loans->list($request->validate((new LoanListRequest)->rules())));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request), (new LoanRequest)->messages());
        $loan = Loan::create($data + ['created_by' => $request->user()->id]);

        return response()->json($loan->fresh(), 201);
    }

    public function update(Request $request, $id)
    {
        $loan = Loan::findOrFail($id);
        $data = $request->validate($this->rules($request, $loan), (new LoanRequest)->messages());
        $this->loans->checkLoanEdit($loan, $data);
        $loan->update($data);

        return response()->json($loan->fresh());
    }

    public function destroy($id)
    {
        $this->loans->assertDeletable([Loan::findOrFail($id)->id]);

        return parent::destroy($id);
    }

    public function bulkDelete(Request $request)
    {
        $this->loans->assertDeletable($request->validate(['ids' => 'required|array'])['ids']);

        return parent::bulkDelete($request);
    }

    public function statement($id)
    {
        return response()->json($this->loans->statement(Loan::findOrFail($id)));
    }

    protected function rules(Request $request, $model = null): array
    {
        return (new LoanRequest)->rules();
    }

    protected function syncRelations($model, array $data): void {}
}
