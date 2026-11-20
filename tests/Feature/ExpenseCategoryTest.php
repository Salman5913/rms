<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Role;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpenseCategoryTest extends TestCase
{
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

        // the expense-categories routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    private function actAsRoleWith(array $flags): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => 'expense-categories'] + $flags);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    public function test_it_creates_lists_searches_updates_and_deletes_a_category(): void
    {
        $id = $this->postJson('/api/admin/expense-categories', ['name' => 'Electricity'])
            ->assertCreated()
            ->assertJsonPath('name', 'Electricity')
            ->assertJsonPath('status', true)
            ->json('id');
        ExpenseCategory::create(['name' => 'Rent']);

        $this->getJson('/api/admin/expense-categories?search=elec')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.name', 'Electricity');

        $this->postJson("/api/admin/expense-categories/{$id}", ['name' => 'Electricity Bill', 'status' => false])
            ->assertOk()->assertJsonPath('name', 'Electricity Bill')->assertJsonPath('status', false);

        $this->deleteJson("/api/admin/expense-categories/{$id}")->assertOk();
        $this->assertDatabaseMissing('expense_categories', ['id' => $id]);
    }

    public function test_the_list_shows_entries_amount_and_percent_per_category(): void
    {
        $rent = ExpenseCategory::create(['name' => 'Rent']);
        $gas = ExpenseCategory::create(['name' => 'Gas']);
        ExpenseCategory::create(['name' => 'Unused']);
        foreach ([[$rent, 600], [$rent, 150], [$gas, 250]] as [$category, $amount]) {
            Expense::create(['expense_category_id' => $category->id, 'expense_date' => '2026-11-01', 'amount' => $amount, 'payment_method' => 'cash']);
        }

        $rows = collect($this->getJson('/api/admin/expense-categories')->assertOk()->json('data'))->keyBy('name');

        $this->assertSame(['entries' => 2, 'amount' => 750, 'percent' => 75], collect($rows['Rent'])->only('entries', 'amount', 'percent')->all());
        $this->assertSame(['entries' => 1, 'amount' => 250, 'percent' => 25], collect($rows['Gas'])->only('entries', 'amount', 'percent')->all());
        $this->assertSame(0, $rows['Unused']['entries']);
        $this->assertNull($rows['Unused']['amount']);
    }

    public function test_name_is_required_and_unique(): void
    {
        $rent = ExpenseCategory::create(['name' => 'Rent']);

        $this->postJson('/api/admin/expense-categories', [])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/admin/expense-categories', ['name' => 'Rent'])->assertUnprocessable()->assertJsonValidationErrors('name');

        // keeping its own name on edit is not a duplicate
        $this->postJson("/api/admin/expense-categories/{$rent->id}", ['name' => 'Rent'])->assertOk();
    }

    public function test_a_category_with_expenses_cannot_be_deleted(): void
    {
        $rent = ExpenseCategory::create(['name' => 'Rent']);
        Expense::create(['expense_category_id' => $rent->id, 'expense_date' => '2026-11-01', 'amount' => 50000, 'payment_method' => 'bank']);

        $this->deleteJson("/api/admin/expense-categories/{$rent->id}")
            ->assertUnprocessable()->assertJsonValidationErrors('category');
        $this->postJson('/api/admin/expense-categories-bulk-delete', ['ids' => [$rent->id]])
            ->assertUnprocessable()->assertJsonValidationErrors('category');

        $this->assertDatabaseHas('expense_categories', ['id' => $rent->id]);
    }

    public function test_it_needs_the_expense_categories_permission(): void
    {
        $this->actAsRoleWith(['can_view' => true, 'can_create' => false, 'can_edit' => false, 'can_delete' => false]);

        $this->getJson('/api/admin/expense-categories')->assertOk();
        $this->postJson('/api/admin/expense-categories', ['name' => 'Gas'])->assertForbidden();
        $this->assertDatabaseMissing('expense_categories', ['name' => 'Gas']);
    }
}
