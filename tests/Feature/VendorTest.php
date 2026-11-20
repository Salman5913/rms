<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Models\Vendor;
use App\Models\VendorTransaction;
use App\Services\VendorLedgerService;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VendorTest extends TestCase
{
    private const TODAY = '2026-11-18';

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
            'database/migrations/2026_11_18_000002_create_vendors_table.php',
            'database/migrations/2026_11_18_000003_create_vendor_transactions_table.php',
        ]]);

        // the vendor routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        $this->admin = User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]);
        Sanctum::actingAs($this->admin);

        $this->travelTo(Carbon::parse(self::TODAY.' 15:00:00'));
    }

    private function vendor(array $attrs = []): Vendor
    {
        return Vendor::create($attrs + ['name' => 'Ali Traders', 'opening_balance' => 0, 'status' => true]);
    }

    private function tx(Vendor $vendor, string $type, float $amount, string $date, array $attrs = []): VendorTransaction
    {
        return $vendor->transactions()->create($attrs + [
            'type' => $type, 'amount' => $amount, 'transaction_date' => $date, 'created_by' => $this->admin->id,
        ]);
    }

    private function actAsRoleWith(array $flags): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => 'vendors'] + $flags);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    /* ---------- vendors CRUD + list totals ---------- */

    public function test_crud_and_search(): void
    {
        $id = $this->postJson('/api/admin/vendors', [
            'name' => 'Ali Traders', 'phone' => '03001112223', 'company' => 'Ali & Sons', 'opening_balance' => 5000,
        ])->assertCreated()
            ->assertJsonPath('status', true)
            ->assertJsonPath('opening_balance', 5000)
            ->json('id');
        $this->postJson('/api/admin/vendors', ['name' => 'Milk Wala'])->assertCreated()->assertJsonPath('opening_balance', 0);

        $this->getJson('/api/admin/vendors?search=sons')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->getJson('/api/admin/vendors?search=0300111')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/admin/vendors?search=milk')->assertOk()->assertJsonPath('data.0.name', 'Milk Wala');

        $this->postJson("/api/admin/vendors/$id", ['name' => 'Ali Traders', 'status' => false])
            ->assertOk()->assertJsonPath('status', false);

        $this->deleteJson("/api/admin/vendors/$id")->assertOk();
        $this->assertSame(1, Vendor::count());
    }

    public function test_vendor_validation(): void
    {
        $this->postJson('/api/admin/vendors', ['opening_balance' => 'abc'])
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'opening_balance']);
    }

    public function test_list_returns_totals_and_balance_per_vendor_and_grand_totals(): void
    {
        $ali = $this->vendor(['name' => 'Ali', 'opening_balance' => 1000]);
        $this->tx($ali, 'purchase', 5000, '2026-11-01');
        $this->tx($ali, 'purchase', 2000, '2026-11-05');
        $this->tx($ali, 'payment', 3000, '2026-11-06');

        // paid in advance: balance goes negative
        $milk = $this->vendor(['name' => 'Milk', 'opening_balance' => 0]);
        $this->tx($milk, 'purchase', 500, '2026-11-02');
        $this->tx($milk, 'payment', 1500, '2026-11-03');

        $res = $this->getJson('/api/admin/vendors')->assertOk();
        $rows = collect($res->json('data'))->keyBy('name');

        $this->assertEquals(7000, $rows['Ali']['total_purchases']);
        $this->assertEquals(3000, $rows['Ali']['total_payments']);
        $this->assertEquals(5000, $rows['Ali']['balance']);          // 1000 + 7000 - 3000
        $this->assertEquals(-1000, $rows['Milk']['balance']);        // advance

        $this->assertEquals([
            'total_purchases' => 7500, 'total_payments' => 4500, 'balance' => 4000, 'total_owed' => 5000, 'total_advance' => 1000,
        ], $res->json('totals'));
    }

    public function test_list_can_be_filtered_by_balance_or_advance(): void
    {
        $owed = $this->vendor(['name' => 'Owed', 'opening_balance' => 500]);
        $advance = $this->vendor(['name' => 'Advance']);
        $this->tx($advance, 'payment', 300, '2026-11-01');
        $this->vendor(['name' => 'Settled']);   // balance 0: in neither filter

        $this->getJson('/api/admin/vendors?balance=owed')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $owed->id)
            ->assertJsonPath('total', 1)
            ->assertJsonPath('totals.total_owed', 500);   // grand totals ignore the filter
        $this->getJson('/api/admin/vendors?balance=advance&search=adv')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $advance->id);
        $this->getJson('/api/admin/vendors')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/admin/vendors?balance=zero')->assertUnprocessable()->assertJsonValidationErrors('balance');
    }

    public function test_list_can_be_filtered_by_status(): void
    {
        $active = $this->vendor(['name' => 'Active One']);
        $disabled = $this->vendor(['name' => 'Disabled One', 'status' => false]);

        $this->getJson('/api/admin/vendors?status=1')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $active->id);
        $this->getJson('/api/admin/vendors?status=0')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $disabled->id);
        $this->getJson('/api/admin/vendors?status=0&balance=owed')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/admin/vendors')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/admin/vendors?status=maybe')->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_vendor_with_transactions_cannot_be_deleted(): void
    {
        $vendor = $this->vendor();
        $this->tx($vendor, 'purchase', 100, '2026-11-10');

        $this->deleteJson("/api/admin/vendors/{$vendor->id}")->assertUnprocessable()->assertJsonValidationErrors('vendor');
        $this->postJson('/api/admin/vendors-bulk-delete', ['ids' => [$vendor->id]])->assertUnprocessable();
        $this->assertSame(1, Vendor::count());
    }

    /* ---------- transactions ---------- */

    public function test_add_edit_and_delete_transactions(): void
    {
        $vendor = $this->vendor();

        $id = $this->postJson("/api/admin/vendors/{$vendor->id}/transactions", [
            'type' => 'payment', 'transaction_date' => '2026-11-17', 'amount' => 2500,
            'reference' => 'CHQ-12', 'payment_method' => 'bank', 'comment' => 'November advance',
        ])->assertCreated()
            ->assertJsonPath('source', 'manual')
            ->assertJsonPath('created_by', $this->admin->id)
            ->assertJsonPath('payment_method', 'bank')
            ->json('id');

        $this->postJson("/api/admin/vendor-transactions/$id", [
            'type' => 'payment', 'transaction_date' => '2026-11-16', 'amount' => 3000, 'payment_method' => 'cash',
        ])->assertOk()->assertJsonPath('amount', 3000)->assertJsonPath('transaction_date', '2026-11-16');

        $this->deleteJson("/api/admin/vendor-transactions/$id")->assertOk();
        $this->assertSame(0, VendorTransaction::count());
    }

    public function test_transaction_validation(): void
    {
        $vendor = $this->vendor();
        $url = "/api/admin/vendors/{$vendor->id}/transactions";

        $this->postJson($url, ['type' => 'purchase', 'transaction_date' => '2026-11-18', 'amount' => 0])
            ->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->postJson($url, ['type' => 'purchase', 'transaction_date' => '2026-11-18', 'amount' => -5])
            ->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->postJson($url, ['type' => 'purchase', 'transaction_date' => '2026-11-19', 'amount' => 10])
            ->assertUnprocessable()->assertJsonValidationErrors('transaction_date');
        $this->postJson($url, ['type' => 'purchase', 'transaction_date' => '2026-11-18', 'amount' => 10, 'payment_method' => 'cash'])
            ->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->postJson($url, ['type' => 'payment', 'transaction_date' => '2026-11-18', 'amount' => 10, 'payment_method' => 'card'])
            ->assertUnprocessable()->assertJsonValidationErrors('payment_method');
        $this->postJson($url, ['type' => 'refund', 'transaction_date' => '2026-11-18', 'amount' => 10])
            ->assertUnprocessable()->assertJsonValidationErrors('type');

        // a payment with a method and a purchase without one are fine (today is allowed)
        $this->postJson($url, ['type' => 'payment', 'transaction_date' => '2026-11-18', 'amount' => 10, 'payment_method' => 'cash'])->assertCreated();
        $this->postJson($url, ['type' => 'purchase', 'transaction_date' => '2026-11-18', 'amount' => 10])->assertCreated();
    }

    public function test_inactive_vendor_rejects_new_entries(): void
    {
        $vendor = $this->vendor(['status' => false]);

        $this->postJson("/api/admin/vendors/{$vendor->id}/transactions", [
            'type' => 'purchase', 'transaction_date' => '2026-11-18', 'amount' => 100,
        ])->assertUnprocessable()->assertJsonValidationErrors('vendor');
        $this->assertSame(0, VendorTransaction::count());
    }

    public function test_receipt_has_the_entry_vendor_and_balance_before_and_after(): void
    {
        $vendor = $this->vendor(['name' => 'Ali Traders', 'phone' => '0300', 'opening_balance' => 1000]);
        $this->tx($vendor, 'purchase', 5000, '2026-11-01');
        $this->tx($vendor, 'purchase', 700, '2026-11-10');              // same day as the payment, entered first
        $payment = $this->tx($vendor, 'payment', 2000, '2026-11-10', ['reference' => 'CHQ-1', 'payment_method' => 'bank']);
        $this->tx($vendor, 'purchase', 300, '2026-11-12');              // after: only in the current balance

        $this->getJson("/api/admin/vendor-transactions/{$payment->id}/receipt")->assertOk()
            ->assertJsonPath('transaction.type', 'payment')
            ->assertJsonPath('transaction.reference', 'CHQ-1')
            ->assertJsonPath('transaction.payment_method', 'bank')
            ->assertJsonPath('transaction.created_by', 'Admin')
            ->assertJsonPath('vendor.name', 'Ali Traders')
            ->assertJsonPath('balance_before', 6700)     // 1000 + 5000 + 700
            ->assertJsonPath('balance_after', 4700)      // - 2000
            ->assertJsonPath('current_balance', 5000);   // + 300
    }

    public function test_receipt_needs_view_permission(): void
    {
        $tx = $this->tx($this->vendor(), 'purchase', 100, '2026-11-10');
        Sanctum::actingAs(User::forceCreate(['name' => 'Nobody', 'email' => 'n@example.test', 'password' => bcrypt('password')]));

        $this->getJson("/api/admin/vendor-transactions/{$tx->id}/receipt")->assertForbidden();
    }

    public function test_chai_transactions_cannot_be_edited_or_deleted_here(): void
    {
        $tx = $this->tx($this->vendor(), 'purchase', 700, '2026-11-10', ['source' => 'chai']);

        $this->postJson("/api/admin/vendor-transactions/{$tx->id}", [
            'type' => 'purchase', 'transaction_date' => '2026-11-10', 'amount' => 900,
        ])->assertUnprocessable()->assertJsonValidationErrors('source');
        $this->deleteJson("/api/admin/vendor-transactions/{$tx->id}")->assertUnprocessable();

        $this->assertEquals(700, $tx->fresh()->amount);
    }

    /* ---------- ledger ---------- */

    public function test_ledger_opening_balance_for_range_debit_credit_and_closing(): void
    {
        $vendor = $this->vendor(['opening_balance' => 1000]);
        $this->tx($vendor, 'purchase', 4000, '2026-10-20');                       // before the range
        $this->tx($vendor, 'payment', 1500, '2026-10-25');                        // before the range
        $this->tx($vendor, 'purchase', 2000, '2026-11-02', ['reference' => 'B-1']);
        $this->tx($vendor, 'payment', 1000, '2026-11-05', ['payment_method' => 'cash']);
        $this->tx($vendor, 'purchase', 9999, '2026-12-01');                       // after the range (data typed earlier)

        $res = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?from=2026-11-01&to=2026-11-30")->assertOk()
            ->assertJsonPath('restaurant', config('app.name'))
            ->assertJsonPath('range.preset', 'custom')
            ->assertJsonPath('vendor.balance', 14499);   // 1000 + 4000 - 1500 + 2000 - 1000 + 9999

        $this->assertEquals(3500, $res->json('opening_balance_for_range'));   // 1000 + 4000 - 1500

        $rows = $res->json('rows.data');
        $this->assertCount(2, $rows);
        // oldest first
        $this->assertSame(['2026-11-02', '2026-11-05'], array_column($rows, 'date'));
        $this->assertEquals(['debit' => 0, 'credit' => 2000, 'running_balance' => 5500],
            collect($rows[0])->only('debit', 'credit', 'running_balance')->all());
        $this->assertEquals(['debit' => 1000, 'credit' => 0, 'running_balance' => 4500],
            collect($rows[1])->only('debit', 'credit', 'running_balance')->all());

        $this->assertEquals(['debit' => 1000, 'credit' => 2000, 'count' => 2, 'closing_balance' => 4500], $res->json('totals'));
        $this->assertNull($res->json('matched_totals'));
    }

    public function test_ledger_without_range_starts_at_the_vendor_opening_balance(): void
    {
        $vendor = $this->vendor(['opening_balance' => 300]);
        $this->tx($vendor, 'purchase', 200, '2026-01-01');

        $res = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger")->assertOk()
            ->assertJsonPath('range.preset', 'all')
            ->assertJsonPath('range.from', null);

        $this->assertEquals(300, $res->json('opening_balance_for_range'));
        $this->assertEquals(500, $res->json('rows.data.0.running_balance'));
        $this->assertEquals(500, $res->json('totals.closing_balance'));
    }

    public function test_quick_range_is_resolved_on_the_server(): void
    {
        $vendor = $this->vendor();
        $this->tx($vendor, 'purchase', 100, '2026-11-15');   // Sunday, last week
        $this->tx($vendor, 'purchase', 200, '2026-11-16');   // Monday, this week

        $res = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?range=this_week")->assertOk()
            ->assertJsonPath('range.from', '2026-11-16')
            ->assertJsonPath('range.to', self::TODAY);

        $this->assertEquals(100, $res->json('opening_balance_for_range'));
        $this->assertEquals(200, $res->json('totals.credit'));
    }

    public function test_running_balance_carries_over_to_page_two(): void
    {
        $vendor = $this->vendor(['opening_balance' => 1000]);
        // 25 purchases of 100 on consecutive days: running balance after the n-th one = 1000 + n * 100
        for ($i = 1; $i <= 25; $i++) {
            $this->tx($vendor, 'purchase', 100, Carbon::parse('2026-10-01')->addDays($i - 1)->toDateString());
        }

        $page1 = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?page=1")->assertOk();
        $page2 = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?page=2")->assertOk();

        $this->assertCount(20, $page1->json('rows.data'));
        $this->assertSame(2, $page1->json('rows.last_page'));
        $this->assertEquals(1100, $page1->json('rows.data.0.running_balance'));    // oldest: 1st
        $this->assertEquals(3000, $page1->json('rows.data.19.running_balance'));   // 20th

        $this->assertCount(5, $page2->json('rows.data'));
        $this->assertEquals(3100, $page2->json('rows.data.0.running_balance'));    // 21st, not restarted
        $this->assertEquals(3500, $page2->json('rows.data.4.running_balance'));    // 25th
        $this->assertEquals(3500, $page2->json('totals.closing_balance'));
    }

    public function test_same_day_entries_are_ordered_by_id(): void
    {
        $vendor = $this->vendor();
        $this->tx($vendor, 'purchase', 1000, '2026-11-10');
        $this->tx($vendor, 'payment', 400, '2026-11-10');

        $rows = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger")->json('rows.data');

        $this->assertSame(['purchase', 'payment'], array_column($rows, 'type'));
        $this->assertEquals([1000, 600], array_column($rows, 'running_balance'));
    }

    public function test_search_filters_rows_but_keeps_the_true_running_balance(): void
    {
        $vendor = $this->vendor(['opening_balance' => 100]);
        $this->tx($vendor, 'purchase', 1000, '2026-11-01', ['comment' => 'Flour bags']);
        $this->tx($vendor, 'purchase', 500, '2026-11-02', ['comment' => 'Sugar']);
        $this->tx($vendor, 'payment', 300, '2026-11-03', ['comment' => 'Cash for flour']);
        $this->tx($vendor, 'purchase', 50, '2026-11-04', ['reference' => 'INV-FLOUR-9']);

        $res = $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?search=flour")->assertOk();
        $rows = $res->json('rows.data');

        $this->assertSame(['2026-11-01', '2026-11-03', '2026-11-04'], array_column($rows, 'date'));
        $this->assertEquals([1100, 1300, 1350], array_column($rows, 'running_balance'));

        // range totals stay for the whole range; matched rows are totalled separately
        $this->assertEquals(['debit' => 300, 'credit' => 1550, 'count' => 4, 'closing_balance' => 1350], $res->json('totals'));
        $this->assertEquals(['debit' => 300, 'credit' => 1050, 'count' => 3], $res->json('matched_totals'));
    }

    public function test_all_returns_every_row_of_the_range_for_printing(): void
    {
        $vendor = $this->vendor();
        for ($i = 1; $i <= 22; $i++) {
            $this->tx($vendor, 'purchase', 10, '2026-11-01');
        }

        $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?all=1")->assertOk()->assertJsonCount(22, 'rows.data');
    }

    public function test_ledger_rejects_a_bad_range(): void
    {
        $vendor = $this->vendor();

        $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?range=forever")->assertUnprocessable()->assertJsonValidationErrors('range');
        $this->getJson("/api/admin/vendors/{$vendor->id}/ledger?from=2026-11-10&to=2026-11-01")->assertUnprocessable()->assertJsonValidationErrors('to');
    }

    /* ---------- purchases total (used by Profit & Loss) ---------- */

    public function test_purchases_total_counts_purchases_only_within_the_range(): void
    {
        $a = $this->vendor(['name' => 'A', 'opening_balance' => 5000]);
        $b = $this->vendor(['name' => 'B']);
        $this->tx($a, 'purchase', 1000, '2026-11-01');
        $this->tx($b, 'purchase', 250, '2026-11-15');
        $this->tx($a, 'payment', 700, '2026-11-10');      // not a purchase
        $this->tx($b, 'purchase', 400, '2026-10-31');     // before the range

        $service = app(VendorLedgerService::class);

        $this->assertEquals(1250, $service->purchasesTotal('2026-11-01', '2026-11-30'));
        $this->assertEquals(1650, $service->purchasesTotal());
        $this->assertEquals(0, $service->purchasesTotal('2026-11-16', '2026-11-30'));
    }

    /* ---------- permissions ---------- */

    public function test_user_without_create_permission_cannot_add_a_purchase_or_payment(): void
    {
        $vendor = $this->vendor();
        $this->actAsRoleWith(['can_view' => true]);

        $this->getJson('/api/admin/vendors')->assertOk();
        $this->getJson("/api/admin/vendors/{$vendor->id}/ledger")->assertOk();
        $this->postJson("/api/admin/vendors/{$vendor->id}/transactions", [
            'type' => 'purchase', 'transaction_date' => '2026-11-18', 'amount' => 100,
        ])->assertForbidden();
        $this->postJson("/api/admin/vendors/{$vendor->id}/transactions", [
            'type' => 'payment', 'transaction_date' => '2026-11-18', 'amount' => 100, 'payment_method' => 'cash',
        ])->assertForbidden();
        $this->postJson('/api/admin/vendors', ['name' => 'New'])->assertForbidden();
        $this->assertSame(0, VendorTransaction::count());
    }

    public function test_edit_and_delete_need_their_own_permissions(): void
    {
        $vendor = $this->vendor();
        $tx = $this->tx($vendor, 'purchase', 100, '2026-11-10');
        $this->actAsRoleWith(['can_view' => true, 'can_create' => true]);

        $this->postJson("/api/admin/vendor-transactions/{$tx->id}", [
            'type' => 'purchase', 'transaction_date' => '2026-11-10', 'amount' => 200,
        ])->assertForbidden();
        $this->deleteJson("/api/admin/vendor-transactions/{$tx->id}")->assertForbidden();
        $this->deleteJson("/api/admin/vendors/{$vendor->id}")->assertForbidden();
    }

    public function test_user_without_any_vendor_permission_is_forbidden(): void
    {
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Nobody', 'email' => 'nobody@example.test', 'password' => bcrypt('password'),
        ]));

        $this->getJson('/api/admin/vendors')->assertForbidden();
    }

    public function test_role_can_be_granted_vendor_permissions(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Purchaser',
            'permissions' => [['module' => 'vendors', 'can_view' => true, 'can_create' => true]],
        ])->assertCreated()->assertJsonPath('permissions.0.module', 'vendors');
    }
}
