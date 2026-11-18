<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\LabourRequest;
use App\Models\Labour;
use Illuminate\Http\Request;

class LabourController extends ApiCrudController
{
    protected string $model = Labour::class;

    protected array $search = ['name', 'phone', 'cnic'];

    /** ?user_type=rider etc. narrows the list (and the CSV export) */
    protected function filter($query, Request $request): void
    {
        if ($type = $request->query('user_type')) {
            $query->where('user_type', $type);
        }
    }

    /** rider dropdown for delivery orders: active riders only */
    public function riders()
    {
        return response()->json(Labour::activeRiders()->orderBy('name')->get(['id', 'name', 'phone']));
    }

    protected function rules(Request $request, $model = null): array
    {
        return (new LabourRequest)->rules();
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['status'] = $data['status'] ?? true;
        $f['pay_rate'] = $data['pay_rate'] ?? 0;

        return $f;
    }

    protected function syncRelations($model, array $data): void {}
}
