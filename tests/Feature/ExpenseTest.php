<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Role;
use App\Models\User;
use App\Services\ExpenseService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpenseTest extends TestCase
{
    /** a Thursday: this week = 16-19 Nov, this month = 1-19 Nov */
    private const TODAY = '2026-11-19';

    private User $admin;

    private ExpenseCategory $rent;

    private ExpenseCategory $gas;

    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2026_11_04_140948_create_personal_access_tokens_table.php',
            'database/migrations/2026_11_15_000002_add_delete_and_sub_modules_to_role_permissions.php',
            'database/migrations/2026_11_19_000004_create_expense_tables.php',
        ]]);

        // the expense routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        $this->admin = User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]);
        Sanctum::actingAs($this->admin);

        $this->travelTo(Carbon::parse(self::TODAY.' 15:00:00'));

        $this->rent = ExpenseCategory::create(['name' => 'Rent']);
        $this->gas = ExpenseCategory::create(['name' => 'Gas']);
    }

    private function expense(float $amount, string $date, ?ExpenseCategory $category = null, array $attrs = []): Expense
    {
        return Expense::create($attrs + [
            'expense_category_id' => ($category ?? $this->gas)->id,
            'expense_date' => $date, 'amount' => $amount, 'payment_method' => 'cash',
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'expense_category_id' => $this->gas->id, 'expense_date' => self::TODAY, 'amount' => 2500,
            'payment_method' => 'cash', 'paid_to' => 'SSGC', 'reference' => 'BILL-77', 'comment' => 'November gas bill',
        ];
    }

    /** queries the endpoint runs (called once first, so the user's role, cached after the first request, isn't counted unevenly) */
    private function queryCount(string $url): int
    {
        $this->getJson($url)->assertOk();
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($url)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    /* ---------------- create / update / delete ---------------- */

    public function test_it_adds_edits_and_deletes_an_expense(): void
    {
        $id = $this->postJson('/api/admin/expenses', $this->payload())
            ->assertCreated()
            ->assertJsonPath('amount', 2500)
            ->assertJsonPath('category.name', 'Gas')
            ->assertJsonPath('creator.name', 'Admin')
            ->json('id');
        $this->assertDatabaseHas('expenses', ['id' => $id, 'created_by' => $this->admin->id, 'paid_to' => 'SSGC']);

        $this->postJson("/api/admin/expenses/{$id}", $this->payload(['amount' => 3000, 'expense_category_id' => $this->rent->id]))
            ->assertOk()->assertJsonPath('amount', 3000)->assertJsonPath('category.name', 'Rent');

        $this->deleteJson("/api/admin/expenses/{$id}")->assertOk();
        $this->assertDatabaseMissing('expenses', ['id' => $id]);
    }

    public function test_it_validates_amount_date_category_and_payment_method(): void
    {
        $this->postJson('/api/admin/expenses', $this->payload(['amount' => 0]))->assertJsonValidationErrors('amount');
        $this->postJson('/api/admin/expenses', $this->payload(['amount' => -5]))->assertJsonValidationErrors('amount');
        $this->postJson('/api/admin/expenses', $this->payload(['expense_date' => '2026-11-20']))->assertJsonValidationErrors('expense_date');
        $this->postJson('/api/admin/expenses', $this->payload(['payment_method' => 'cheque']))->assertJsonValidationErrors('payment_method');
        $this->postJson('/api/admin/expenses', $this->payload(['expense_category_id' => 999]))->assertJsonValidationErrors('expense_category_id');

        $this->assertSame(0, Expense::count());
    }

    public function test_an_inactive_category_is_rejected_for_new_expenses_but_kept_on_edit(): void
    {
        $old = $this->expense(1000, '2026-11-02', $this->rent);
        $this->rent->update(['status' => false]);

        $this->postJson('/api/admin/expenses', $this->payload(['expense_category_id' => $this->rent->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('expense_category_id');

        // an existing entry may keep its (now inactive) category
        $this->postJson("/api/admin/expenses/{$old->id}", $this->payload(['expense_category_id' => $this->rent->id, 'amount' => 1200]))
            ->assertOk();

        // the dropdown endpoint still lists it, with its status, so the page can hide it for new entries
        $this->getJson('/api/admin/expenses/categories')->assertOk()
            ->assertJsonPath('0.name', 'Gas')->assertJsonPath('1.name', 'Rent')->assertJsonPath('1.status', false);
    }

    /* ---------------- list ---------------- */

    public function test_list_filters_by_preset_category_and_search(): void
    {
        $this->expense(100, '2026-11-19', $this->gas, ['comment' => 'cylinder refill']);
        $this->expense(200, '2026-11-18', $this->rent, ['paid_to' => 'Landlord']);
        $this->expense(300, '2026-11-10', $this->gas, ['reference' => 'R-55']);
        $this->expense(400, '2026-10-30', $this->rent);
        $this->expense(500, '2025-12-31', $this->gas);

        $total = fn (string $q) => $this->getJson("/api/admin/expenses?{$q}")->assertOk()->json('totals.total');

        $this->assertEquals(100, $total('preset=today'));
        $this->assertEquals(200, $total('preset=yesterday'));
        $this->assertEquals(300, $total('preset=this_week'));
        $this->assertEquals(600, $total('preset=this_month'));
        $this->assertEquals(1000, $total('preset=this_year'));
        $this->assertEquals(1500, $total('preset=all'));
        $this->assertEquals(700, $total('preset=custom&from=2026-10-01&to=2026-11-10'));
        $this->assertEquals(400, $total('preset=this_month&category_id='.$this->gas->id));
        $this->assertEquals(100, $total('preset=all&search=cylinder'));
        $this->assertEquals(200, $total('preset=all&search=landlord'));
        $this->assertEquals(300, $total('preset=all&search=R-55'));

        // newest first, with the category name
        $this->getJson('/api/admin/expenses?preset=this_month')
            ->assertJsonPath('data.0.expense_date', '2026-11-19')
            ->assertJsonPath('data.0.category.name', 'Gas')
            ->assertJsonPath('data.2.expense_date', '2026-11-10')
            ->assertJsonPath('range.from', '2026-11-01')
            ->assertJsonPath('range.to', self::TODAY);
    }

    public function test_list_totals_cover_the_whole_range_not_just_the_page(): void
    {
        for ($i = 1; $i <= 25; $i++) {
            $this->expense(10, '2026-11-05');
        }

        $this->getJson('/api/admin/expenses?preset=this_month')->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('total', 25)
            ->assertJsonPath('last_page', 2)
            ->assertJsonPath('totals.count', 25)
            ->assertJsonPath('totals.total', 250);

        $this->getJson('/api/admin/expenses?preset=this_month&page=2')
            ->assertJsonCount(5, 'data')->assertJsonPath('totals.total', 250);
    }

    /* ---------------- report and print ---------------- */

    public function test_report_gives_per_category_totals_that_match_the_list(): void
    {
        $this->expense(100, '2026-11-02', $this->gas);
        $this->expense(150, '2026-11-03', $this->gas, ['comment' => 'refill']);
        $this->expense(750, '2026-11-01', $this->rent, ['comment' => 'refill?']);
        $this->expense(9999, '2026-10-01', $this->rent);   // outside the range

        $report = $this->getJson('/api/admin/expenses/report?preset=this_month')->assertOk()
            ->assertJsonPath('range.from', '2026-11-01')
            ->assertJsonPath('categories.0.name', 'Rent')   // biggest first
            ->assertJsonPath('categories.0.count', 1)
            ->assertJsonPath('categories.0.total', 750)
            ->assertJsonPath('categories.0.percent', 75)
            ->assertJsonPath('categories.1.name', 'Gas')
            ->assertJsonPath('categories.1.count', 2)
            ->assertJsonPath('categories.1.total', 250)
            ->assertJsonPath('totals.count', 3)
            ->assertJsonPath('totals.total', 1000)
            ->json();

        $this->assertEquals($this->getJson('/api/admin/expenses?preset=this_month')->json('totals'), $report['totals']);

        // and with category + search filters
        $q = 'preset=this_month&search=refill&category_id='.$this->gas->id;
        $this->assertEquals(
            ['count' => 1, 'total' => 150],
            $this->getJson("/api/admin/expenses?{$q}")->json('totals'),
        );
        $this->assertEquals(
            $this->getJson("/api/admin/expenses?{$q}")->json('totals'),
            $this->getJson("/api/admin/expenses/report?{$q}")->json('totals'),
        );
    }

    public function test_inactive_categories_still_show_in_the_report(): void
    {
        $this->expense(500, '2026-11-02', $this->rent);
        $this->rent->update(['status' => false]);

        $this->getJson('/api/admin/expenses/report?preset=this_month')
            ->assertJsonPath('categories.0.name', 'Rent')->assertJsonPath('totals.total', 500);
    }

    public function test_print_returns_all_rows_of_the_range_with_the_report(): void
    {
        for ($i = 1; $i <= 25; $i++) {
            $this->expense(10, '2026-11-05');
        }
        $this->expense(9999, '2026-10-01');

        $this->getJson('/api/admin/expenses/print?preset=this_month')->assertOk()
            ->assertJsonCount(25, 'rows')
            ->assertJsonPath('rows.0.category.name', 'Gas')
            ->assertJsonPath('capped', false)
            ->assertJsonPath('limit', ExpenseService::PRINT_LIMIT)
            ->assertJsonPath('categories.0.total', 250)
            ->assertJsonPath('totals.total', 250);
    }

    /* ---------------- totalForRange (Profit & Loss) ---------------- */

    public function test_total_for_range_including_open_ranges(): void
    {
        $this->expense(100, '2026-10-31');
        $this->expense(200, '2026-11-01');
        $this->expense(300, '2026-11-19', $this->rent);

        $service = app(ExpenseService::class);
        $this->assertSame(500.0, $service->totalForRange('2026-11-01', '2026-11-19'));
        $this->assertSame(200.0, $service->totalForRange('2026-11-01', '2026-11-01'));
        $this->assertSame(500.0, $service->totalForRange('2026-11-01', null));
        $this->assertSame(300.0, $service->totalForRange(null, '2026-11-01'));
        $this->assertSame(600.0, $service->totalForRange());
        $this->assertSame(0.0, $service->totalForRange('2027-01-01', '2027-01-31'));
    }

    /* ---------------- query count ---------------- */

    public function test_list_report_and_print_run_the_same_small_number_of_queries_for_5_and_50_expenses(): void
    {
        $urls = [
            'list' => '/api/admin/expenses?preset=this_month&search=a',
            'report' => '/api/admin/expenses/report?preset=this_month&search=a',
            'print' => '/api/admin/expenses/print?preset=this_month&search=a',
        ];
        $add = function (int $n) {
            for ($i = 0; $i < $n; $i++) {
                $this->expense(10, '2026-11-0'.($i % 9 + 1), $i % 2 ? $this->rent : $this->gas,
                    ['comment' => 'a', 'created_by' => $this->admin->id]);
            }
        };

        $add(5);
        $with5 = array_map(fn ($url) => $this->queryCount($url), $urls);
        $add(45);
        $with50 = array_map(fn ($url) => $this->queryCount($url), $urls);

        $this->assertSame($with5, $with50);
        // list: totals + rows + categories + creators; report: grouped totals + names; print: report + rows + categories + creators
        $this->assertSame(['list' => 4, 'report' => 2, 'print' => 5], $with50);
    }

    /* ---------------- permissions ---------------- */

    public function test_without_expenses_create_an_expense_cannot_be_added(): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => 'expenses', 'can_view' => true, 'can_create' => false, 'can_edit' => false, 'can_delete' => false]);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));

        $this->getJson('/api/admin/expenses')->assertOk();
        $this->postJson('/api/admin/expenses', $this->payload())->assertForbidden();
        $this->assertSame(0, Expense::count());

        $expense = $this->expense(100, '2026-11-01');
        $this->postJson("/api/admin/expenses/{$expense->id}", $this->payload())->assertForbidden();
        $this->deleteJson("/api/admin/expenses/{$expense->id}")->assertForbidden();
    }

    public function test_a_user_without_any_role_is_forbidden(): void
    {
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Nobody', 'email' => 'nobody@example.test', 'password' => bcrypt('password'),
        ]));

        $this->getJson('/api/admin/expenses')->assertForbidden();
        $this->getJson('/api/admin/expenses/report')->assertForbidden();
        $this->getJson('/api/admin/expenses/print')->assertForbidden();
    }
}
