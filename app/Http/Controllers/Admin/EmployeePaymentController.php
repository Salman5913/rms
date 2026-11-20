<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\EmployeeLedgerRequest;
use App\Http\Requests\EmployeePaymentRequest;
use App\Http\Requests\SalarySuggestionRequest;
use App\Models\Employee;
use App\Models\EmployeePayment;
use App\Services\EmployeePaymentService;

/** salary payments and advances of employees (permission module: employee-payments) */
class EmployeePaymentController extends Controller
{
    public function __construct(private EmployeePaymentService $payments) {}

    /** payroll: payments of all employees with the range totals */
    public function index(EmployeeLedgerRequest $request)
    {
        return response()->json($this->payments->payroll($request->validated()));
    }

    public function ledger(EmployeeLedgerRequest $request, $employeeId)
    {
        return response()->json($this->payments->ledger(Employee::findOrFail($employeeId), $request->validated()));
    }

    public function suggestion(SalarySuggestionRequest $request, $employeeId)
    {
        $data = $request->validated();

        return response()->json($this->payments->suggestion(
            Employee::findOrFail($employeeId),
            $data['period_from'],
            $data['period_to'],
            isset($data['units']) ? (float) $data['units'] : null,
            isset($data['payment_id']) ? (int) $data['payment_id'] : null,
        ));
    }

    public function store(EmployeePaymentRequest $request, $employeeId)
    {
        $payment = $this->payments->create(Employee::findOrFail($employeeId), $request->validated(), $request->user());

        return response()->json($payment->fresh(), 201);
    }

    public function update(EmployeePaymentRequest $request, $id)
    {
        $payment = $this->payments->update(EmployeePayment::with('employee')->findOrFail($id), $request->validated());

        return response()->json($payment->fresh());
    }

    public function destroy($id)
    {
        $this->payments->delete(EmployeePayment::with('employee')->findOrFail($id));

        return response()->json(['ok' => true]);
    }

    /** data for the printed salary / advance slip */
    public function slip($id)
    {
        return response()->json($this->payments->slip(EmployeePayment::with('employee', 'creator:id,name')->findOrFail($id)));
    }
}
