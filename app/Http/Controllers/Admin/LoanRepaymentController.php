<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoanRepaymentRequest;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Services\LoanService;

/** repayments on a loan (permission module: loans) */
class LoanRepaymentController extends Controller
{
    public function __construct(private LoanService $loans) {}

    public function store(LoanRepaymentRequest $request, $loanId)
    {
        $repayment = $this->loans->addRepayment(Loan::findOrFail($loanId), $request->validated(), $request->user());

        return response()->json($repayment->fresh(), 201);
    }

    public function update(LoanRepaymentRequest $request, $id)
    {
        $repayment = $this->loans->updateRepayment(LoanRepayment::findOrFail($id), $request->validated());

        return response()->json($repayment->fresh());
    }

    public function destroy($id)
    {
        LoanRepayment::findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }
}
