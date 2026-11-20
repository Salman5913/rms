<?php

namespace App\Http\Requests;

use App\Models\Employee;
use Illuminate\Foundation\Http\FormRequest;

/** admin walk-in orders (pickup / dinein / delivery) */
class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => 'required|string',
            // home delivery: who and where to deliver to; rider can be assigned later
            'customer_name' => 'required_if:type,delivery|nullable|string|max:255',
            'customer_phone' => 'required_if:type,delivery|nullable|string|max:50',
            'address' => 'required_if:type,delivery|nullable|string|max:1000',
            'rider_id' => ['nullable', 'integer', Employee::activeRiderRule()],
            'delivery_area_id' => 'required_if:type,delivery|nullable|integer|exists:delivery_areas,id,status,1',
            'notes' => 'nullable|string',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'nullable|integer',
            'items.*.deal_id' => 'nullable|integer',
            'items.*.name' => 'required|string',
            'items.*.unit_price' => 'required|numeric',
            'items.*.qty' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
        ];
    }

    public function messages(): array
    {
        return [
            'customer_name.required_if' => 'Customer name is required for home delivery orders.',
            'customer_phone.required_if' => 'Customer phone is required for home delivery orders.',
            'address.required_if' => 'Delivery address is required for home delivery orders.',
            'rider_id.exists' => 'The selected rider is not an active rider.',
        ];
    }
}
