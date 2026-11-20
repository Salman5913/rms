<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\VendorLedgerRequest;
use App\Http\Requests\VendorRequest;
use App\Models\Vendor;
use App\Services\VendorLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VendorController extends ApiCrudController
{
    protected string $model = Vendor::class;

    protected array $search = ['name', 'phone', 'company'];

    public function __construct(private VendorLedgerService $ledger) {}

    /** the paginated list also carries the grand totals across all vendors */
    public function index(Request $request)
    {
        $response = parent::index($request);
        if (! $response instanceof JsonResponse || $request->query('all') === '1') {
            return $response;
        }

        return response()->json($response->getData(true) + ['totals' => $this->ledger->vendorTotals()]);
    }

    public function ledger(VendorLedgerRequest $request, $id)
    {
        return response()->json($this->ledger->ledger(Vendor::findOrFail($id), $request->validated()));
    }

    public function destroy($id)
    {
        $this->ledger->assertDeletable([Vendor::findOrFail($id)->id]);

        return parent::destroy($id);
    }

    public function bulkDelete(Request $request)
    {
        $this->ledger->assertDeletable($request->validate(['ids' => 'required|array'])['ids']);

        return parent::bulkDelete($request);
    }

    /** list rows get total_purchases, total_payments and balance (SQL aggregates); ?balance=owed|advance narrows them
        (?status= is handled by ApiCrudController) */
    protected function filter($query, Request $request): void
    {
        $query->withBalance();

        $balance = $request->validate(['balance' => ['nullable', Rule::in(Vendor::BALANCE_FILTERS)]])['balance'] ?? null;
        if ($balance) {
            $query->whereBalance($balance);
        }
    }

    protected function rules(Request $request, $model = null): array
    {
        return (new VendorRequest)->rules();
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['status'] = $data['status'] ?? true;
        $f['opening_balance'] = $data['opening_balance'] ?? 0;

        return $f;
    }

    protected function syncRelations($model, array $data): void {}
}
