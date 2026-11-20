<?php

namespace Tests\Feature;

use App\Models\Loan;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use App\Services\EmployeePaymentService;
use App\Services\SalesReportService;
use App\Services\VendorLedgerService;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LoanTest extends TestCase
{
    private const TODAY = '2026-11-19';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs
        // (orders, daily closes, employee payments and vendors are here only to prove loans don't touch their figures)
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2024_01_01_000007_create_orders_and_order_items.php',
            'database/migrations/2026_11_04_140948_create_personal_access_tokens_table.php',
            'database/migrations/2026_11_15_000001_add_preparing_status_to_orders.php',
            'database/migrations/2026_11_15_000002_add_delete_and_sub_modules_to_role_permissions.php',
            'database/migrations/2026_11_17_000001_create_delivery_areas_table.php',
            'database/migrations/2026_11_17_000002_add_delivery_fields_to_orders.php',
            'database/migrations/2026_11_17_000003_relax_order_type_and_customer_name.php',
            'database/migrations/2026_11_17_000004_create_labours_table.php',
            'database/migrations/2026_11_17_000005_add_rider_to_orders.php',
            'database/migrations/2026_11_17_000006_add_cancelled_status_to_orders.php',
            'database/migrations/2026_11_17_000007_create_daily_closes_table.php',
            'database/migrations/2026_11_18_000002_create_vendors_table.php',
            'database/migrations/2026_11_18_000003_create_vendor_transactions_table.php',
            'database/migrations/2026_11_18_000004_create_labour_payments_table.php',
            'database/migrations/2026_11_19_000001_add_user_type_other_to_labours_table.php',
            'database/migrations/2026_11_19_000003_rename_labours_to_employees.php',
            'database/migrations/2026_11_19_000002_create_loans_table.php',
        ]]);

        // the loan routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        $this->admin = User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]);
        Sanctum::actingAs($this->admin);

        $this->travelTo(Carbon::parse(self::TODAY.' 15:00:00'));
    }

    private function loan(float $amount = 100000, string $date = '2026-11-01', array $attrs = []): Loan
    {
        return Loan::create($attrs + ['lender_name' => 'Bank Alfalah', 'loan_date' => $date, 'amount' => $amount]);
    }

    private function repay(Loan $loan, float $amount, string $date = '2026-11-10', array $attrs = []): TestResponse
    {
        return $this->postJson("/api/admin/loans/{$loan->id}/repayments", $attrs + [
            'repayment_date' => $date, 'amount' => $amount, 'payment_method' => 'cash',
        ]);
    }

    private function actAsRoleWith(array $flags): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => 'loans'] + $flags);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    /* ---------- loans CRUD ---------- */

    public function test_crud_validation_and_search(): void
    {
        $id = $this->postJson('/api/admin/loans', [
            'lender_name' => 'Uncle Hamid', 'lender_phone' => '03001112223', 'loan_date' => '2026-11-05',
            'amount' => 50000, 'reference' => 'CHQ-778', 'comment' => 'for the new oven',
        ])->assertCreated()
            ->assertJsonPath('amount', 50000)
            ->assertJsonPath('created_by', $this->admin->id)
            ->json('id');
        $this->loan(20000, '2026-11-02', ['lender_name' => 'Meezan Bank']);

        $this->postJson('/api/admin/loans', ['amount' => 0, 'loan_date' => '2026-11-20'])
            ->assertStatus(422)->assertJsonValidationErrors(['lender_name', 'amount', 'loan_date'])
            ->assertJsonPath('errors.amount.0', 'The amount must be greater than 0.')
            ->assertJsonPath('errors.loan_date.0', 'The loan date cannot be in the future.');

        foreach (['hamid', '0300111', 'chq-778', 'oven'] as $term) {
            $this->getJson("/api/admin/loans?search=$term")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        }

        $this->postJson("/api/admin/loans/$id", ['lender_name' => 'Hamid', 'loan_date' => '2026-11-05', 'amount' => 60000])
            ->assertOk()->assertJsonPath('amount', 60000)->assertJsonPath('created_by', $this->admin->id);

        $this->deleteJson("/api/admin/loans/$id")->assertOk();
        $this->assertSame(1, Loan::count());
    }

    /* ---------- remaining, status and totals ---------- */

    public function test_remaining_status_and_list_totals(): void
    {
        $open = $this->loan(100000, '2026-11-01');
        $paid = $this->loan(30000, '2026-11-03', ['lender_name' => 'Friend']);
        $this->loan(5000, '2026-10-01', ['lender_name' => 'Old loan']);   // outside "this_month"
        $this->repay($open, 40000)->assertCreated();
        $this->repay($open, 10000)->assertCreated();
        $this->repay($paid, 30000)->assertCreated();

        $all = $this->getJson('/api/admin/loans')->assertOk()->assertJsonCount(3, 'data');
        $rows = collect($all->json('data'))->keyBy('id');
        $this->assertEquals([50000, 50000, 'active'], [$rows[$open->id]['repaid'], $rows[$open->id]['remaining'], $rows[$open->id]['status']]);
        $this->assertEquals([30000, 0, 'paid'], [$rows[$paid->id]['repaid'], $rows[$paid->id]['remaining'], $rows[$paid->id]['status']]);
        $all->assertJsonPath('totals', ['borrowed' => 135000, 'repaid' => 80000, 'remaining' => 55000]);

        // newest loan date first
        $this->assertSame([$paid->id, $open->id], array_slice(array_column($all->json('data'), 'id'), 0, 2));

        $this->getJson('/api/admin/loans?status=active')->assertJsonCount(2, 'data')
            ->assertJsonPath('totals', ['borrowed' => 105000, 'repaid' => 50000, 'remaining' => 55000]);
        $this->getJson('/api/admin/loans?status=paid')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $paid->id);

        $this->getJson('/api/admin/loans?range=this_month')->assertJsonCount(2, 'data')
            ->assertJsonPath('range', ['from' => '2026-11-01', 'to' => self::TODAY])
            ->assertJsonPath('totals.borrowed', 130000);
        $this->getJson('/api/admin/loans?range=custom&from=2026-10-01&to=2026-10-31')->assertJsonCount(1, 'data')
            ->assertJsonPath('totals', ['borrowed' => 5000, 'repaid' => 0, 'remaining' => 5000]);

        $this->getJson('/api/admin/loans?status=nope')->assertStatus(422);
    }

    /* ---------- repayment rules ---------- */

    public function test_repayment_more_than_remaining_is_rejected_on_create_and_update(): void
    {
        $loan = $this->loan(10000);
        $this->repay($loan, 10000.01)->assertStatus(422)
            ->assertJsonPath('errors.amount.0', 'The amount cannot be more than the remaining Rs. 10,000.00.');
        $first = $this->repay($loan, 6000)->assertCreated()->json('id');
        $this->repay($loan, 4000.01)->assertStatus(422)->assertJsonValidationErrors('amount');
        $second = $this->repay($loan, 4000)->assertCreated()->json('id');

        // editing: its own amount doesn't count against itself (6000 + 4000 = 10000 is fine, 6000.01 is not)
        $body = ['repayment_date' => '2026-11-10', 'payment_method' => 'bank'];
        $this->postJson("/api/admin/loan-repayments/$first", $body + ['amount' => 6000])->assertOk()->assertJsonPath('payment_method', 'bank');
        $this->postJson("/api/admin/loan-repayments/$first", $body + ['amount' => 6000.01])
            ->assertStatus(422)->assertJsonValidationErrors('amount');

        $this->deleteJson("/api/admin/loan-repayments/$second")->assertOk();
        $this->postJson("/api/admin/loan-repayments/$first", $body + ['amount' => 10000])->assertOk();
    }

    public function test_repayment_dated_before_the_loan_or_in_the_future_is_rejected(): void
    {
        $loan = $this->loan(10000, '2026-11-05');
        $this->repay($loan, 100, '2026-11-04')->assertStatus(422)->assertJsonValidationErrors('repayment_date');
        $this->repay($loan, 100, '2026-11-20')->assertStatus(422)->assertJsonValidationErrors('repayment_date');
        $this->repay($loan, 0, '2026-11-05')->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->repay($loan, 100, '2026-11-05', ['payment_method' => 'card'])->assertStatus(422)->assertJsonValidationErrors('payment_method');
        $this->repay($loan, 100, '2026-11-05')->assertCreated();
        $this->repay($loan, 100, self::TODAY)->assertCreated();
    }

    public function test_loan_with_repayments_cannot_be_deleted_and_amount_cannot_go_below_repaid(): void
    {
        $loan = $this->loan(10000, '2026-11-01');
        $this->repay($loan, 7000, '2026-11-10')->assertCreated();

        $this->deleteJson("/api/admin/loans/{$loan->id}")->assertStatus(422)->assertJsonValidationErrors('loan');
        $this->postJson('/api/admin/loans-bulk-delete', ['ids' => [$loan->id]])->assertStatus(422);
        $this->assertSame(1, Loan::count());

        $body = ['lender_name' => 'Bank Alfalah', 'loan_date' => '2026-11-01'];
        $this->postJson("/api/admin/loans/{$loan->id}", $body + ['amount' => 6999])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->postJson("/api/admin/loans/{$loan->id}", $body + ['amount' => 7000])->assertOk();
        $this->getJson('/api/admin/loans')->assertJsonPath('data.0.status', 'paid');

        // the loan date can't move after its first repayment
        $this->postJson("/api/admin/loans/{$loan->id}", ['lender_name' => 'X', 'loan_date' => '2026-11-11', 'amount' => 7000])
            ->assertStatus(422)->assertJsonValidationErrors('loan_date');
    }

    /* ---------- statement ---------- */

    public function test_statement_lists_repayments_oldest_first_with_remaining_after(): void
    {
        $loan = $this->loan(10000, '2026-11-01');
        $this->repay($loan, 3000, '2026-11-15')->assertCreated();
        $this->repay($loan, 1000, '2026-11-05', ['comment' => 'first'])->assertCreated();
        $this->repay($loan, 2000, '2026-11-15')->assertCreated();

        $s = $this->getJson("/api/admin/loans/{$loan->id}/statement")->assertOk()
            ->assertJsonPath('loan.lender_name', 'Bank Alfalah')
            ->assertJsonPath('loan.status', 'active')
            ->assertJsonPath('totals', ['amount' => 10000, 'repaid' => 6000, 'remaining' => 4000])
            ->json('repayments');

        $this->assertEquals(['2026-11-05', '2026-11-15', '2026-11-15'], array_column($s, 'repayment_date'));
        $this->assertEquals([1000, 3000, 2000], array_column($s, 'amount'));
        $this->assertEquals([9000, 6000, 4000], array_column($s, 'remaining_after'));
        $this->assertSame('first', $s[0]['comment']);
        $this->assertSame('Admin', $s[0]['created_by']);

        $this->getJson('/api/admin/loans/999/statement')->assertNotFound();
    }

    /* ---------- loans are not income or expenses ---------- */

    public function test_loans_do_not_change_sales_daily_close_vendor_or_payroll_figures(): void
    {
        $order = new Order(['order_number' => 'PICKUP-1', 'type' => 'pickup', 'status' => 'RECEIVED', 'total' => 1500]);
        $order->created_at = Carbon::parse(self::TODAY.' 12:00:00');
        $order->save();

        $figures = fn () => [
            app(SalesReportService::class)->forDate(self::TODAY),
            $this->getJson('/api/admin/daily-close?date='.self::TODAY)->assertOk()->json('summary'),
            app(EmployeePaymentService::class)->salariesPaidTotal(),
            app(VendorLedgerService::class)->purchasesTotal(),
        ];
        $before = $figures();

        $loan = $this->loan(250000, self::TODAY);
        $this->repay($loan, 50000, self::TODAY)->assertCreated();

        $this->assertEquals($before, $figures());
        $this->assertEquals(1500, $before[0]['total_sales']);
    }

    /* ---------- permissions ---------- */

    public function test_without_create_permission_loans_and_repayments_cannot_be_added(): void
    {
        $loan = $this->loan(10000);
        $this->actAsRoleWith(['can_view' => true, 'can_edit' => true, 'can_delete' => true]);

        $this->getJson('/api/admin/loans')->assertOk();
        $this->getJson("/api/admin/loans/{$loan->id}/statement")->assertOk();
        $this->postJson('/api/admin/loans', ['lender_name' => 'X', 'loan_date' => '2026-11-01', 'amount' => 10])->assertForbidden();
        $this->repay($loan, 100)->assertForbidden();
        $this->assertSame(1, Loan::count());
        $this->assertSame(0, $loan->repayments()->count());
    }

    public function test_without_any_permission_everything_is_forbidden(): void
    {
        $loan = $this->loan(10000);
        $repaymentId = $this->repay($loan, 100)->assertCreated()->json('id');
        $this->actAsRoleWith(['can_view' => false]);

        $this->getJson('/api/admin/loans')->assertForbidden();
        $this->getJson("/api/admin/loans/{$loan->id}")->assertForbidden();
        $this->getJson("/api/admin/loans/{$loan->id}/statement")->assertForbidden();
        $this->postJson("/api/admin/loans/{$loan->id}", ['lender_name' => 'X', 'loan_date' => '2026-11-01', 'amount' => 10])->assertForbidden();
        $this->deleteJson("/api/admin/loans/{$loan->id}")->assertForbidden();
        $this->postJson("/api/admin/loan-repayments/$repaymentId", ['repayment_date' => '2026-11-10', 'amount' => 1, 'payment_method' => 'cash'])->assertForbidden();
        $this->deleteJson("/api/admin/loan-repayments/$repaymentId")->assertForbidden();
    }
}
