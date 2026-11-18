<?php

namespace App\Http\Requests;

use App\Models\Labour;
use Illuminate\Foundation\Http\FormRequest;

class AssignRiderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['rider_id' => ['present', 'nullable', 'integer', Labour::activeRiderRule()]];
    }

    public function messages(): array
    {
        return ['rider_id.exists' => 'The selected rider is not an active rider.'];
    }
}
