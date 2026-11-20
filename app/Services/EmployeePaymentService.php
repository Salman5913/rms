<?php

namespace App\Services;

use App\Helpers\DateRangeHelper;
use App\Models\Employee;
use App\Models\EmployeePayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Salary payments and advances of employees (employees).
 * - advance: cash given before salary (amount = the advance).
 * - salary: pay for a period; amount = net paid = earned - advance_deducted.
 * Outstanding advance = all advances - all advance_deducted.
 * Every figure uses payment_date (the date the user entered), never created_at.
 */
class EmployeePaymentService
{
    public const PER_PAGE = 20;

    /* ---------------- totals ---------------- */

    /**
     * Cash paid to staff between two dates (both inclusive; null = unbounded), used by Profit & Loss:
     * advances given + net salaries. An advance is never counted twice because the salary only stores the net.
     */
    public function salariesPaidTotal(?string $from = null, ?string $to = null): float
    {
        return round((float) $this->between(EmployeePayment::query(), $from, $to)->sum('amount'), 2);
    }

    /** advances - deductions; $exceptPaymentId leaves one payment out (used when editing / deleting it) */
    public function outstandingAdvance(Employee $employee, ?int $exceptPaymentId = null): float
    {
        $row = $employee->payments()->toBase()
            ->when($exceptPaymentId, fn ($q) => $q->where('id', '!=', $exceptPaymentId))
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'advance' THEN amount ELSE 0 END), 0) as given, COALESCE(SUM(advance_deducted), 0) as deducted")
            ->first();

        return round((float) $row->given - (float) $row->deducted, 2);
    }

    /* ---------------- salary suggestion ---------------- */

    /** what "Pay salary" pre-fills: units from the period (unless given), earned = pay_rate x units */
    public function suggestion(Employee $employee, string $from, string $to, ?float $units = null, ?int $exceptPaymentId = null): array
    {
        $units ??= $this->unitsFor($employee->pay_type, $from, $to);

        return [
            'pay_type' => $employee->pay_type,
            'pay_rate' => (float) $employee->pay_rate,
            'units' => $units,
            'earned' => round((float) $employee->pay_rate * $units, 2),
            'outstanding_advance' => $this->outstandingAdvance($employee, $exceptPaymentId),
            'already_paid_periods' => $this->overlappingSalaries($employee, $from, $to, $exceptPaymentId)
                ->map(fn (EmployeePayment $p) => $p->only(['id', 'period_from', 'period_to', 'payment_date', 'amount']))
                ->values()->all(),
        ];
    }

    /**
     * months / weeks / days in a period (both ends inclusive).
     * Months are counted per calendar month, so 1-30 Nov = 1 and 1-15 Nov = 0.5.
     */
    public function unitsFor(string $payType, string $from, string $to): float
    {
        $start = Carbon::parse($from)->startOfDay();
        $end = Carbon::parse($to)->startOfDay();
        $days = (int) round(abs($start->diffInDays($end))) + 1;

        if ($payType === 'weekly') {
            return round($days / 7, 2);
        }
        if ($payType !== 'monthly') {
            return (float) $days;   // daily: days worked (editable)
        }

        $months = 0.0;
        for ($cursor = $start->copy(); $cursor->lte($end); $cursor = $monthEnd->copy()->addDay()) {
            $monthEnd = $cursor->copy()->endOfMonth()->startOfDay()->min($end);
            $months += ((int) round(abs($cursor->diffInDays($monthEnd))) + 1) / $cursor->daysInMonth;
        }

        return round($months, 2);
    }

    /* ---------------- create / update / delete ---------------- */

    public function create(Employee $employee, array $data, User $user): EmployeePayment
    {
        if (! $employee->status) {
            throw ValidationException::withMessages(['employee' => 'This employee is inactive. Activate them before adding new payments.']);
        }

        return $employee->payments()->create($this->prepare($employee, $data) + ['created_by' => $user->id]);
    }

    public function update(EmployeePayment $payment, array $data): EmployeePayment
    {
        if ($data['type'] !== $payment->type) {
            throw ValidationException::withMessages(['type' => 'A payment type cannot be changed. Delete it and add a new one instead.']);
        }
        $payment->update($this->prepare($payment->employee, $data, $payment));

        return $payment;
    }

    public function delete(EmployeePayment $payment): void
    {
        if ($payment->type === EmployeePayment::ADVANCE && $this->outstandingAdvance($payment->employee, $payment->id) < 0) {
            throw ValidationException::withMessages([
                'payment' => 'This advance has already been deducted from a salary. Edit or delete that salary payment first.',
            ]);
        }
        $payment->delete();
    }

    /** employees with payments can't be deleted (deactivate them instead) */
    public function assertDeletable(array $employeeIds): void
    {
        $used = Employee::whereIn('id', $employeeIds)->whereHas('payments')->pluck('name');
        if ($used->isNotEmpty()) {
            throw ValidationException::withMessages([
                'employee' => 'Employees with salary payments or advances cannot be deleted. Deactivate them instead: '.$used->join(', ').'.',
            ]);
        }
    }

    /* ---------------- ledger / payroll ---------------- */

    /** one employee's payments, oldest first, with the range totals */
    public function ledger(Employee $employee, array $filters): array
    {
        return [
            'restaurant' => config('app.name'),
            'employee' => $employee->only(['id', 'name', 'phone', 'cnic', 'user_type', 'user_type_other', 'pay_type', 'pay_rate', 'status'])
                + ['outstanding_advance' => $this->outstandingAdvance($employee)],
        ] + $this->listing(['employee_id' => $employee->id] + $filters);
    }

    /** payments across all employees (?employee_id= narrows it); the P&L check screen */
    public function payroll(array $filters): array
    {
        return ['restaurant' => config('app.name')] + $this->listing($filters, withEmployee: true);
    }

    /** everything a printed salary / advance slip needs */
    public function slip(EmployeePayment $payment): array
    {
        $employee = $payment->employee;
        // outstanding advance right after this entry (ledger order: payment_date, then id)
        $upToThis = $employee->payments()->toBase()
            ->where(fn ($q) => $q->where('payment_date', '<', $payment->payment_date)
                ->orWhere(fn ($qq) => $qq->where('payment_date', $payment->payment_date)->where('id', '<=', $payment->id)))
            ->selectRaw("COALESCE(SUM(CASE WHEN type = 'advance' THEN amount ELSE 0 END), 0) - COALESCE(SUM(advance_deducted), 0) as outstanding")
            ->value('outstanding');

        return [
            'restaurant' => config('app.name'),
            'payment' => $this->row($payment) + [
                'created_at' => $payment->created_at,
                'created_by' => $payment->creator?->name,
            ],
            'employee' => $employee->only(['id', 'name', 'phone', 'cnic', 'user_type', 'user_type_other', 'pay_type', 'pay_rate']),
            'outstanding_after' => round((float) $upToThis, 2),
            'outstanding_now' => $this->outstandingAdvance($employee),
        ];
    }

    /** resolves ?preset= (quick filter) or ?from=&to= (custom) to [preset, from, to] */
    public function resolveRange(array $filters): array
    {
        $preset = $filters['preset'] ?? null;
        if ($preset && $preset !== 'custom') {
            return ['preset' => $preset] + DateRangeHelper::forPreset($preset);
        }

        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        return ['preset' => $from || $to ? 'custom' : 'all', 'from' => $from, 'to' => $to];
    }

    /* ---------------- internals ---------------- */

    /** rows (20 per page, or all with ?all=1) + totals over every row matching the filters, not just the page */
    private function listing(array $filters, bool $withEmployee = false): array
    {
        $range = $this->resolveRange($filters);
        $search = trim((string) ($filters['search'] ?? ''));

        $query = fn () => $this->between(EmployeePayment::query(), $range['from'], $range['to'])
            ->when($filters['employee_id'] ?? null, fn ($q, $id) => $q->where('employee_id', $id))
            ->when($filters['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->when($search !== '', fn ($q) => $q->where('comment', 'like', "%{$search}%"));

        $rows = $query()->when($withEmployee, fn ($q) => $q->with('employee:id,name,user_type,user_type_other'))
            ->orderBy('payment_date')->orderBy('id');   // oldest first, like the vendor ledger
        $toRow = fn (EmployeePayment $p) => $this->row($p, $withEmployee);
        $rows = ! empty($filters['all'])
            ? ['data' => $rows->get()->map($toRow)->all()]
            : $rows->paginate(self::PER_PAGE, ['*'], 'page', (int) ($filters['page'] ?? 1))->through($toRow);

        return [
            'range' => $range,
            'type' => $filters['type'] ?? null,
            'search' => $search,
            'rows' => $rows,
            'totals' => $this->totals($query()),
        ];
    }

    /** advances given, salaries earned, advances deducted, net salaries and total cash paid of a query */
    private function totals(Builder $q): array
    {
        $t = $q->toBase()->selectRaw(
            "COALESCE(SUM(CASE WHEN type = 'advance' THEN amount ELSE 0 END), 0) as advances_given,"
            ." COALESCE(SUM(CASE WHEN type = 'salary' THEN earned ELSE 0 END), 0) as salaries_earned,"
            .' COALESCE(SUM(advance_deducted), 0) as advances_deducted,'
            ." COALESCE(SUM(CASE WHEN type = 'salary' THEN amount ELSE 0 END), 0) as net_salaries,"
            .' COALESCE(SUM(amount), 0) as total_paid, COUNT(*) as count'
        )->first();

        return collect((array) $t)->map(fn ($v, $k) => $k === 'count' ? (int) $v : round((float) $v, 2))->all();
    }

    private function row(EmployeePayment $p, bool $withEmployee = false): array
    {
        $isAdvance = $p->type === EmployeePayment::ADVANCE;
        $row = [
            'id' => $p->id,
            'employee_id' => $p->employee_id,
            'date' => substr((string) $p->payment_date, 0, 10),
            'type' => $p->type,
            'period_from' => $p->period_from ? substr((string) $p->period_from, 0, 10) : null,
            'period_to' => $p->period_to ? substr((string) $p->period_to, 0, 10) : null,
            'units' => $p->units,
            'earned' => $isAdvance ? 0.0 : $p->earned,
            'advance_given' => $isAdvance ? $p->amount : 0.0,
            'advance_deducted' => $p->advance_deducted,
            'cash_paid' => $p->amount,
            'payment_method' => $p->payment_method,
            'comment' => $p->comment,
        ];

        return $withEmployee ? $row + ['employee' => $p->employee?->only(['id', 'name', 'user_type', 'user_type_other'])] : $row;
    }

    /**
     * Validated input -> the columns to save. Checks that need the database:
     * salary: deduction <= outstanding advance, net >= 0, no overlapping salary period;
     * advance: editing it may not make the outstanding advance negative.
     */
    private function prepare(Employee $employee, array $data, ?EmployeePayment $existing = null): array
    {
        $common = collect($data)->only(['type', 'payment_date', 'payment_method'])->all()
            + ['comment' => $data['comment'] ?? null];
        $outstanding = $this->outstandingAdvance($employee, $existing?->id);

        if ($data['type'] === EmployeePayment::ADVANCE) {
            $amount = round((float) $data['amount'], 2);
            if ($outstanding + $amount < 0) {
                throw ValidationException::withMessages([
                    'amount' => 'Rs. '.number_format(-$outstanding, 2).' of this advance has already been deducted from salaries. The advance cannot be less than that.',
                ]);
            }

            return $common + [
                'period_from' => null, 'period_to' => null, 'units' => null,
                'earned' => 0, 'advance_deducted' => 0, 'amount' => $amount,
            ];
        }

        $earned = round((float) $data['earned'], 2);
        $deducted = round((float) ($data['advance_deducted'] ?? 0), 2);
        if ($deducted > $outstanding) {
            throw ValidationException::withMessages([
                'advance_deducted' => 'You can deduct at most the outstanding advance (Rs. '.number_format(max($outstanding, 0), 2).').',
            ]);
        }
        if ($deducted > $earned) {
            throw ValidationException::withMessages(['advance_deducted' => 'The advance deducted cannot be more than the salary earned.']);
        }

        $overlap = $this->overlappingSalaries($employee, $data['period_from'], $data['period_to'], $existing?->id)->first();
        if ($overlap) {
            throw ValidationException::withMessages([
                'period_from' => "This period overlaps salary payment #{$overlap->id} ({$overlap->period_from} to {$overlap->period_to}, paid on {$overlap->payment_date}).",
            ]);
        }

        return $common + [
            'period_from' => $data['period_from'],
            'period_to' => $data['period_to'],
            'units' => $data['units'] ?? null,
            'earned' => $earned,
            'advance_deducted' => $deducted,
            'amount' => round($earned - $deducted, 2),   // net paid: never the client's amount
        ];
    }

    private function overlappingSalaries(Employee $employee, string $from, string $to, ?int $exceptPaymentId = null)
    {
        return $employee->payments()->where('type', EmployeePayment::SALARY)
            ->where('period_from', '<=', $to)->where('period_to', '>=', $from)
            ->when($exceptPaymentId, fn ($q) => $q->where('id', '!=', $exceptPaymentId))
            ->orderBy('period_from')->get();
    }

    private function between(Builder $q, ?string $from, ?string $to): Builder
    {
        return $q->when($from, fn ($q) => $q->where('payment_date', '>=', $from))
            ->when($to, fn ($q) => $q->where('payment_date', '<=', $to));
    }
}
