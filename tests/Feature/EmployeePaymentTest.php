<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeePayment;
use App\Models\Role;
use App\Models\User;
use App\Services\EmployeePaymentService;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeePaymentTest extends TestCase
{
    private const TODAY = '2026-11-18';   // a Wednesday

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2026_11_04_140948_create_personal_access_tokens_table.php',
            'database/migrations/2026_11_15_000002_add_delete_and_sub_modules_to_role_permissions.php',
            'database/migrations/2026_11_17_000004_create_labours_table.php',
            'database/migrations/2026_11_18_000004_create_labour_payments_table.php',
            'database/migrations/2026_11_19_000001_add_user_type_other_to_labours_table.php',
            'database/migrations/2026_11_19_000003_rename_labours_to_employees.php',
        ]]);

        // the payment routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        $this->admin = User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]);
        Sanctum::actingAs($this->admin);

        $this->travelTo(Carbon::parse(self::TODAY.' 15:00:00'));
    }

    private function employee(array $attrs = []): Employee
    {
        return Employee::create($attrs + ['name' => 'Bilal', 'user_type' => 'cook', 'pay_type' => 'monthly', 'pay_rate' => 30000, 'status' => true]);
    }

    private function advance(Employee $employee, float $amount, string $date, array $attrs = []): EmployeePayment
    {
        return $employee->payments()->create($attrs + [
            'type' => 'advance', 'payment_date' => $date, 'amount' => $amount, 'payment_method' => 'cash',
        ]);
    }

    private function salary(Employee $employee, string $from, string $to, float $earned, float $deducted = 0, ?string $date = null, array $attrs = []): EmployeePayment
    {
        return $employee->payments()->create($attrs + [
            'type' => 'salary', 'payment_date' => $date ?? $to, 'period_from' => $from, 'period_to' => $to,
            'earned' => $earned, 'advance_deducted' => $deducted, 'amount' => $earned - $deducted, 'payment_method' => 'cash',
        ]);
    }

    private function paySalary(Employee $employee, array $data)
    {
        return $this->postJson("/api/admin/employees/{$employee->id}/payments", $data + [
            'type' => 'salary', 'payment_date' => self::TODAY, 'payment_method' => 'cash',
        ]);
    }

    private function actAsRoleWith(array $flags): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => 'employee-payments'] + $flags);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    /* ---------- salary suggestion ---------- */

    public function test_monthly_suggestion_counts_calendar_months(): void
    {
        $employee = $this->employee(['pay_type' => 'monthly', 'pay_rate' => 30000]);
        $url = "/api/admin/employees/{$employee->id}/salary-suggestion";

        $this->getJson("$url?period_from=2026-11-01&period_to=2026-11-30")->assertOk()
            ->assertJsonPath('pay_type', 'monthly')
            ->assertJsonPath('units', 1)
            ->assertJsonPath('earned', 30000)
            ->assertJsonPath('outstanding_advance', 0)
            ->assertJsonPath('already_paid_periods', []);
        $this->getJson("$url?period_from=2026-11-01&period_to=2026-11-15")->assertOk()
            ->assertJsonPath('units', 0.5)->assertJsonPath('earned', 15000);
        $this->getJson("$url?period_from=2026-10-01&period_to=2026-11-30")->assertOk()
            ->assertJsonPath('units', 2)->assertJsonPath('earned', 60000);
    }

    public function test_weekly_and_daily_suggestions(): void
    {
        $weekly = $this->employee(['pay_type' => 'weekly', 'pay_rate' => 7000]);
        $this->getJson("/api/admin/employees/{$weekly->id}/salary-suggestion?period_from=2026-11-02&period_to=2026-11-15")->assertOk()
            ->assertJsonPath('units', 2)->assertJsonPath('earned', 14000);

        $daily = $this->employee(['name' => 'Asad', 'pay_type' => 'daily', 'pay_rate' => 1500]);
        $url = "/api/admin/employees/{$daily->id}/salary-suggestion?period_from=2026-11-10&period_to=2026-11-16";
        $this->getJson($url)->assertOk()->assertJsonPath('units', 7)->assertJsonPath('earned', 10500);
        // days actually worked typed by the user
        $this->getJson("$url&units=5")->assertOk()->assertJsonPath('units', 5)->assertJsonPath('earned', 7500);
    }

    public function test_suggestion_lists_already_paid_overlapping_periods(): void
    {
        $employee = $this->employee();
        $paid = $this->salary($employee, '2026-10-01', '2026-10-31', 30000);

        $res = $this->getJson("/api/admin/employees/{$employee->id}/salary-suggestion?period_from=2026-10-15&period_to=2026-11-14")->assertOk();
        $this->assertSame([$paid->id], array_column($res->json('already_paid_periods'), 'id'));

        // editing that payment: it isn't its own overlap
        $this->getJson("/api/admin/employees/{$employee->id}/salary-suggestion?period_from=2026-10-15&period_to=2026-11-14&payment_id={$paid->id}")
            ->assertOk()->assertJsonPath('already_paid_periods', []);
    }

    /* ---------- salary payments ---------- */

    public function test_salary_net_is_earned_minus_deduction_and_client_amount_is_ignored(): void
    {
        $employee = $this->employee();
        $this->advance($employee, 5000, '2026-11-05');

        $this->paySalary($employee, [
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'units' => 1,
            'earned' => 30000, 'advance_deducted' => 4000, 'amount' => 999999, 'comment' => 'November',
        ])->assertCreated()
            ->assertJsonPath('type', 'salary')
            ->assertJsonPath('earned', 30000)
            ->assertJsonPath('advance_deducted', 4000)
            ->assertJsonPath('amount', 26000)
            ->assertJsonPath('created_by', $this->admin->id);

        $this->assertEquals(1000, app(EmployeePaymentService::class)->outstandingAdvance($employee));
    }

    public function test_cannot_deduct_more_than_outstanding_and_outstanding_follows_advances_and_deductions(): void
    {
        $employee = $this->employee();
        $service = app(EmployeePaymentService::class);

        $this->postJson("/api/admin/employees/{$employee->id}/payments", [
            'type' => 'advance', 'payment_date' => '2026-11-03', 'amount' => 3000, 'payment_method' => 'cash',
        ])->assertCreated()->assertJsonPath('amount', 3000)->assertJsonPath('earned', 0);
        $this->assertEquals(3000, $service->outstandingAdvance($employee));

        $this->paySalary($employee, ['period_from' => '2026-10-01', 'period_to' => '2026-10-31', 'earned' => 30000, 'advance_deducted' => 3500])
            ->assertUnprocessable()->assertJsonValidationErrors('advance_deducted');

        $this->paySalary($employee, ['period_from' => '2026-10-01', 'period_to' => '2026-10-31', 'earned' => 30000, 'advance_deducted' => 2000])
            ->assertCreated();
        $this->assertEquals(1000, $service->outstandingAdvance($employee));

        $this->getJson('/api/admin/employees')->assertOk()
            ->assertJsonPath('data.0.outstanding_advance', 1000)
            ->assertJsonPath('data.0.last_salary_date', self::TODAY);
    }

    public function test_net_paid_cannot_be_negative(): void
    {
        $employee = $this->employee();
        $this->advance($employee, 50000, '2026-11-01');

        $this->paySalary($employee, ['period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 30000, 'advance_deducted' => 31000])
            ->assertUnprocessable()->assertJsonValidationErrors('advance_deducted');
        // the whole salary may go towards the advance (net 0)
        $this->paySalary($employee, ['period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 30000, 'advance_deducted' => 30000])
            ->assertCreated()->assertJsonPath('amount', 0);
    }

    public function test_editing_a_salary_excludes_its_own_deduction_from_the_limit(): void
    {
        $employee = $this->employee();
        $this->advance($employee, 5000, '2026-11-01');
        $salary = $this->salary($employee, '2026-11-01', '2026-11-30', 30000, 5000);

        $this->postJson("/api/admin/employee-payments/{$salary->id}", [
            'type' => 'salary', 'payment_date' => self::TODAY, 'payment_method' => 'bank',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 32000, 'advance_deducted' => 5000,
        ])->assertOk()->assertJsonPath('amount', 27000)->assertJsonPath('payment_method', 'bank');

        $this->postJson("/api/admin/employee-payments/{$salary->id}", [
            'type' => 'salary', 'payment_date' => self::TODAY, 'payment_method' => 'bank',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 32000, 'advance_deducted' => 5001,
        ])->assertUnprocessable()->assertJsonValidationErrors('advance_deducted');
    }

    public function test_overlapping_salary_period_is_refused_and_adjacent_one_allowed(): void
    {
        $employee = $this->employee();
        $existing = $this->salary($employee, '2026-10-01', '2026-10-31', 30000);

        $res = $this->paySalary($employee, ['period_from' => '2026-10-20', 'period_to' => '2026-11-19', 'earned' => 30000])
            ->assertUnprocessable()->assertJsonValidationErrors('period_from');
        $this->assertStringContainsString("#{$existing->id}", $res->json('errors.period_from.0'));

        $this->paySalary($employee, ['period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 30000])->assertCreated();

        // another employee's periods don't matter
        $other = $this->employee(['name' => 'Other']);
        $this->paySalary($other, ['period_from' => '2026-10-01', 'period_to' => '2026-10-31', 'earned' => 30000])->assertCreated();
    }

    public function test_payment_validation(): void
    {
        $employee = $this->employee();
        $url = "/api/admin/employees/{$employee->id}/payments";

        $this->postJson($url, ['type' => 'advance', 'payment_date' => '2026-11-19', 'amount' => 100, 'payment_method' => 'cash'])
            ->assertUnprocessable()->assertJsonValidationErrors('payment_date');
        $this->postJson($url, ['type' => 'advance', 'payment_date' => self::TODAY, 'amount' => 0, 'payment_method' => 'cash'])
            ->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->postJson($url, ['type' => 'advance', 'payment_date' => self::TODAY, 'amount' => 10, 'payment_method' => 'card'])
            ->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->postJson($url, ['type' => 'bonus', 'payment_date' => self::TODAY, 'amount' => 10, 'payment_method' => 'cash'])
            ->assertUnprocessable()->assertJsonValidationErrors('type');
        $this->paySalary($employee, ['period_from' => '2026-11-10', 'period_to' => '2026-11-01', 'earned' => 100])
            ->assertUnprocessable()->assertJsonValidationErrors('period_to');
        $this->paySalary($employee, ['earned' => 0])
            ->assertUnprocessable()->assertJsonValidationErrors(['period_from', 'period_to', 'earned']);

        $this->assertSame(0, EmployeePayment::count());
    }

    public function test_inactive_employee_rejects_new_payments(): void
    {
        $employee = $this->employee(['status' => false]);

        $this->postJson("/api/admin/employees/{$employee->id}/payments", [
            'type' => 'advance', 'payment_date' => self::TODAY, 'amount' => 100, 'payment_method' => 'cash',
        ])->assertUnprocessable()->assertJsonValidationErrors('employee');
        $this->assertSame(0, EmployeePayment::count());
    }

    /* ---------- deleting ---------- */

    public function test_employee_with_payments_cannot_be_deleted(): void
    {
        $employee = $this->employee();
        $this->advance($employee, 100, '2026-11-10');

        $this->deleteJson("/api/admin/employees/{$employee->id}")->assertUnprocessable()->assertJsonValidationErrors('employee');
        $this->postJson('/api/admin/employees-bulk-delete', ['ids' => [$employee->id]])->assertUnprocessable();
        $this->assertSame(1, Employee::count());
    }

    public function test_deducted_advance_cannot_be_deleted_or_reduced_below_the_deduction(): void
    {
        $employee = $this->employee();
        $advance = $this->advance($employee, 5000, '2026-11-01');
        $salary = $this->salary($employee, '2026-11-01', '2026-11-30', 30000, 3000);

        $this->deleteJson("/api/admin/employee-payments/{$advance->id}")->assertUnprocessable()->assertJsonValidationErrors('payment');
        $this->postJson("/api/admin/employee-payments/{$advance->id}", [
            'type' => 'advance', 'payment_date' => '2026-11-01', 'amount' => 2000, 'payment_method' => 'cash',
        ])->assertUnprocessable()->assertJsonValidationErrors('amount');

        // once the salary is gone, the advance can go too
        $this->deleteJson("/api/admin/employee-payments/{$salary->id}")->assertOk();
        $this->deleteJson("/api/admin/employee-payments/{$advance->id}")->assertOk();
        $this->assertSame(0, EmployeePayment::count());
    }

    public function test_type_of_a_payment_cannot_be_changed(): void
    {
        $advance = $this->advance($this->employee(), 500, '2026-11-01');

        $this->postJson("/api/admin/employee-payments/{$advance->id}", [
            'type' => 'salary', 'payment_date' => '2026-11-01', 'payment_method' => 'cash',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 100,
        ])->assertUnprocessable()->assertJsonValidationErrors('type');
    }

    /* ---------- Profit & Loss total ---------- */

    public function test_salaries_paid_total_is_advances_plus_net_salaries_in_range_without_double_counting(): void
    {
        $a = $this->employee(['name' => 'A']);
        $b = $this->employee(['name' => 'B']);
        $this->advance($a, 5000, '2026-11-03');
        $this->salary($a, '2026-11-01', '2026-11-30', 30000, 5000, '2026-11-15');   // net 25000
        $this->salary($b, '2026-10-01', '2026-10-31', 20000, 0, '2026-11-01');      // net 20000
        $this->advance($b, 1000, '2026-10-31');                                       // before the range
        $this->advance($b, 700, '2026-12-01');                                        // after the range

        $service = app(EmployeePaymentService::class);

        // 5000 + 25000 + 20000: the 5000 advance is not counted again inside the salary
        $this->assertEquals(50000, $service->salariesPaidTotal('2026-11-01', '2026-11-30'));
        $this->assertEquals(51700, $service->salariesPaidTotal());
        $this->assertEquals(0, $service->salariesPaidTotal('2026-11-16', '2026-11-30'));
    }

    /* ---------- ledger ---------- */

    public function test_ledger_rows_oldest_first_with_range_totals(): void
    {
        $employee = $this->employee(['pay_rate' => 30000]);
        $this->advance($employee, 2000, '2026-10-20');                                   // before the range
        $adv = $this->advance($employee, 3000, '2026-11-05', ['comment' => 'Eid advance']);
        $sal = $this->salary($employee, '2026-10-01', '2026-10-31', 30000, 4000, '2026-11-02');

        $res = $this->getJson("/api/admin/employees/{$employee->id}/ledger?from=2026-11-01&to=2026-11-30")->assertOk()
            ->assertJsonPath('employee.name', 'Bilal')
            ->assertJsonPath('employee.outstanding_advance', 1000)   // 2000 + 3000 - 4000
            ->assertJsonPath('range.preset', 'custom');

        $rows = $res->json('rows.data');
        $this->assertSame([$sal->id, $adv->id], array_column($rows, 'id'));
        $this->assertEquals(['earned' => 30000, 'advance_deducted' => 4000, 'cash_paid' => 26000, 'period_from' => '2026-10-01'],
            collect($rows[0])->only('earned', 'advance_deducted', 'cash_paid', 'period_from')->all());
        $this->assertEquals(['advance_given' => 3000, 'cash_paid' => 3000, 'earned' => 0],
            collect($rows[1])->only('advance_given', 'cash_paid', 'earned')->all());

        $this->assertEquals([
            'advances_given' => 3000, 'salaries_earned' => 30000, 'advances_deducted' => 4000,
            'net_salaries' => 26000, 'total_paid' => 29000, 'count' => 2,
        ], $res->json('totals'));
    }

    public function test_ledger_presets_type_filter_and_comment_search(): void
    {
        $employee = $this->employee();
        $this->advance($employee, 100, '2026-11-15', ['comment' => 'Sunday, last week']);
        $this->advance($employee, 200, '2026-11-16', ['comment' => 'Monday tea']);
        $this->salary($employee, '2026-11-09', '2026-11-15', 7000, 0, '2026-11-17', ['comment' => 'Weekly tea pay']);

        $url = "/api/admin/employees/{$employee->id}/ledger";

        $this->getJson("$url?preset=this_week")->assertOk()
            ->assertJsonPath('range.from', '2026-11-16')
            ->assertJsonPath('range.to', self::TODAY)
            ->assertJsonCount(2, 'rows.data')
            ->assertJsonPath('totals.total_paid', 7200);
        $this->getJson("$url?preset=yesterday")->assertOk()->assertJsonCount(1, 'rows.data')->assertJsonPath('rows.data.0.type', 'salary');
        $this->getJson("$url?preset=all&type=advance")->assertOk()
            ->assertJsonCount(2, 'rows.data')->assertJsonPath('totals.advances_given', 300)->assertJsonPath('totals.net_salaries', 0);
        $this->getJson("$url?search=tea")->assertOk()
            ->assertJsonCount(2, 'rows.data')->assertJsonPath('totals.count', 2)->assertJsonPath('totals.total_paid', 7200);
        $this->getJson("$url?preset=forever")->assertUnprocessable()->assertJsonValidationErrors('preset');
    }

    public function test_ledger_paginates_by_20_and_totals_cover_the_whole_range(): void
    {
        $employee = $this->employee();
        for ($i = 1; $i <= 25; $i++) {
            $this->advance($employee, 100, Carbon::parse('2026-10-01')->addDays($i - 1)->toDateString());
        }

        $page1 = $this->getJson("/api/admin/employees/{$employee->id}/ledger?page=1")->assertOk();
        $page2 = $this->getJson("/api/admin/employees/{$employee->id}/ledger?page=2")->assertOk();

        $this->assertCount(20, $page1->json('rows.data'));
        $this->assertSame('2026-10-01', $page1->json('rows.data.0.date'));   // oldest first
        $this->assertSame(2, $page1->json('rows.last_page'));
        $this->assertCount(5, $page2->json('rows.data'));
        $this->assertSame('2026-10-25', $page2->json('rows.data.4.date'));   // newest on the last page
        $this->assertEquals(2500, $page2->json('totals.advances_given'));

        $this->getJson("/api/admin/employees/{$employee->id}/ledger?all=1")->assertOk()->assertJsonCount(25, 'rows.data');
    }

    public function test_payroll_lists_every_employee_and_filters_by_employee(): void
    {
        $a = $this->employee(['name' => 'A']);
        $b = $this->employee(['name' => 'B']);
        $this->advance($a, 1000, '2026-11-02');
        $this->salary($b, '2026-10-01', '2026-10-31', 20000, 0, '2026-11-01');

        $this->getJson('/api/admin/employee-payments?preset=this_month')->assertOk()
            ->assertJsonCount(2, 'rows.data')
            ->assertJsonPath('rows.data.0.employee.name', 'B')   // oldest first: B was paid on 1 Nov
            ->assertJsonPath('totals.total_paid', 21000);
        $this->getJson("/api/admin/employee-payments?employee_id={$b->id}")->assertOk()
            ->assertJsonCount(1, 'rows.data')->assertJsonPath('totals.net_salaries', 20000);
    }

    public function test_slip_has_payment_employee_and_outstanding_after(): void
    {
        $employee = $this->employee(['name' => 'Bilal', 'phone' => '0311']);
        $this->advance($employee, 5000, '2026-11-01');
        $salary = $this->salary($employee, '2026-10-01', '2026-10-31', 30000, 3000, '2026-11-02');
        $this->advance($employee, 1000, '2026-11-10');   // later: only in outstanding_now

        $this->getJson("/api/admin/employee-payments/{$salary->id}/slip")->assertOk()
            ->assertJsonPath('payment.type', 'salary')
            ->assertJsonPath('payment.cash_paid', 27000)
            ->assertJsonPath('employee.name', 'Bilal')
            ->assertJsonPath('outstanding_after', 2000)
            ->assertJsonPath('outstanding_now', 3000);
    }

    /* ---------- permissions ---------- */

    public function test_without_create_permission_salary_cannot_be_paid(): void
    {
        $employee = $this->employee();
        $this->actAsRoleWith(['can_view' => true, 'can_create' => false, 'can_edit' => false, 'can_delete' => false]);

        $this->getJson("/api/admin/employees/{$employee->id}/ledger")->assertOk();
        $this->paySalary($employee, ['period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'earned' => 30000])->assertForbidden();
        $this->assertSame(0, EmployeePayment::count());
    }

    public function test_without_any_permission_everything_is_forbidden(): void
    {
        $employee = $this->employee();
        $payment = $this->advance($employee, 100, '2026-11-01');
        Sanctum::actingAs(User::forceCreate(['name' => 'Nobody', 'email' => 'n@example.test', 'password' => bcrypt('password')]));

        $this->getJson('/api/admin/employee-payments')->assertForbidden();
        $this->getJson("/api/admin/employees/{$employee->id}/ledger")->assertForbidden();
        $this->getJson("/api/admin/employee-payments/{$payment->id}/slip")->assertForbidden();
        $this->postJson("/api/admin/employee-payments/{$payment->id}", [])->assertForbidden();
        $this->deleteJson("/api/admin/employee-payments/{$payment->id}")->assertForbidden();
    }
}
