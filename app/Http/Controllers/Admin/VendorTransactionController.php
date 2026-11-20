<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\VendorTransactionRequest;
use App\Models\Vendor;
use App\Models\VendorTransaction;
use App\Services\VendorLedgerService;

/** purchases / payments entered on the vendor ledger (permission module: vendors) */
class VendorTransactionController extends Controller
{
    public function __construct(private VendorLedgerService $ledger) {}

    public function store(VendorTransactionRequest $request, $vendorId)
    {
        $tx = $this->ledger->addTransaction(Vendor::findOrFail($vendorId), $request->validated(), $request->user());

        return response()->json($tx->fresh(), 201);
    }

    public function update(VendorTransactionRequest $request, $id)
    {
        $tx = $this->ledger->updateTransaction(VendorTransaction::findOrFail($id), $request->validated());

        return response()->json($tx->fresh());
    }

    /** data for the printed purchase / payment receipt */
    public function receipt($id)
    {
        return response()->json($this->ledger->receipt(VendorTransaction::with('vendor', 'creator:id,name')->findOrFail($id)));
    }

    public function destroy($id)
    {
        $this->ledger->deleteTransaction(VendorTransaction::findOrFail($id));

        return response()->json(['ok' => true]);
    }
}
