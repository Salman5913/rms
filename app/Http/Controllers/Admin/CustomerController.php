<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\CustomerRequest;
use App\Models\Customer;
use Illuminate\Http\Request;

/** customers (permission module: customers) */
class CustomerController extends ApiCrudController
{
    protected string $model = Customer::class;

    protected array $search = ['name', 'phone', 'address'];

    protected array $with = ['deliveryArea:id,name'];

    public function store(Request $request)
    {
        $this->normalizePhoneInput($request);

        return parent::store($request);
    }

    public function update(Request $request, $id)
    {
        $this->normalizePhoneInput($request);

        return parent::update($request, $id);
    }

    /**
     * Order create page: the customer saved under this phone number, or null for a new customer.
     * Guarded by delivery-orders.create, so order takers don't need the Customers module.
     */
    public function lookup(Request $request)
    {
        $phone = Customer::normalizePhone($request->validate(['phone' => 'required|string|max:50'])['phone']);

        $customer = Customer::where('phone', $phone)->first(['id', 'name', 'phone', 'address', 'delivery_area_id']);

        return response()->json(['customer' => $customer]);
    }

    protected function rules(Request $request, $model = null): array
    {
        return (new CustomerRequest)->rules($model?->id);
    }

    protected function syncRelations($model, array $data): void {}

    /** the unique check and the saved value both use the normalized phone */
    private function normalizePhoneInput(Request $request): void
    {
        if ($request->has('phone')) {
            $request->merge(['phone' => Customer::normalizePhone($request->input('phone'))]);
        }
    }
}
