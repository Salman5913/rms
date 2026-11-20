<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\EmployeeRequest;
use App\Models\Employee;
use App\Services\EmployeePaymentService;
use Illuminate\Http\Request;

class EmployeeController extends ApiCrudController
{
    protected string $model = Employee::class;

    protected array $search = ['name', 'phone', 'cnic'];

    public function __construct(private EmployeePaymentService $payments) {}

    public function destroy($id)
    {
        $this->payments->assertDeletable([Employee::findOrFail($id)->id]);

        return parent::destroy($id);
    }

    public function bulkDelete(Request $request)
    {
        $this->payments->assertDeletable($request->validate(['ids' => 'required|array'])['ids']);

        return parent::bulkDelete($request);
    }

    /** list rows get outstanding_advance and last_salary_date; ?user_type=rider etc. narrows the list (and the CSV export) */
    protected function filter($query, Request $request): void
    {
        $query->withPaymentSummary();

        if ($type = $request->query('user_type')) {
            $query->where('user_type', $type);
        }
    }

    /** rider dropdown for delivery orders: active riders only; ?all=1 adds disabled ones (for the list's rider filter) */
    public function riders(Request $request)
    {
        $q = $request->query('all') === '1'
            ? Employee::where('user_type', 'rider')
            : Employee::activeRiders();

        return response()->json($q->orderBy('name')->get(['id', 'name', 'phone']));
    }

    protected function rules(Request $request, $model = null): array
    {
        return (new EmployeeRequest)->rules();
    }

    protected function fields(array $data): array
    {
        $f = parent::fields($data);
        $f['status'] = $data['status'] ?? true;
        $f['pay_rate'] = $data['pay_rate'] ?? 0;
        $f['user_type_other'] = self::otherType($data);

        return $f;
    }

    /** the typed type is only kept for "other"; switching to another type clears it (shared with the import) */
    public static function otherType(array $data): ?string
    {
        $text = trim((string) ($data['user_type_other'] ?? ''));

        return ($data['user_type'] ?? null) === Employee::OTHER_TYPE && $text !== '' ? $text : null;
    }

    protected function syncRelations($model, array $data): void {}
}
