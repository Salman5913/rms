<?php

namespace App\Http\Requests;

use App\Models\Labour;
use App\Models\Order;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** edit an order's items; delivery and website orders can also change customer details, rider and delivery area */
class UpdateOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'nullable|integer',
            'items.*.deal_id' => 'nullable|integer',
            'items.*.name' => 'required|string',
            'items.*.unit_price' => 'required|numeric',
            'items.*.qty' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
            // only applied to delivery and website orders; when sent they can't be blank
            'customer_name' => 'sometimes|required|string|max:255',
            'customer_phone' => 'sometimes|required|string|max:50',
            'address' => 'sometimes|required|string|max:1000',
            'rider_id' => ['sometimes', 'nullable', 'integer', Labour::activeRiderRule()],
            // an active area, or the one the order already has (even if since disabled)
            'delivery_area_id' => ['sometimes', 'nullable', 'integer', Rule::exists('delivery_areas', 'id')
                ->where(fn ($q) => $q->where('status', true)->orWhere('id', $this->currentAreaId()))],
        ];
    }

    public function messages(): array
    {
        return [
            'rider_id.exists' => 'The selected rider is not an active rider.',
            'delivery_area_id.exists' => 'The selected delivery area is not active.',
        ];
    }

    private function currentAreaId(): int
    {
        return (int) Order::whereKey($this->route('id'))->value('delivery_area_id');
    }
}
