<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RolePermissionTest extends TestCase
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
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    public function test_it_saves_delete_permission_on_sub_modules(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Cashier',
            'permissions' => [
                ['module' => 'pickup-orders', 'can_view' => true, 'can_create' => true, 'can_edit' => false, 'can_delete' => true],
                ['module' => 'website-orders', 'can_view' => false, 'can_create' => false, 'can_edit' => false, 'can_delete' => false],
            ],
        ])->assertCreated()
            ->assertJsonCount(1, 'permissions')
            ->assertJsonPath('permissions.0.module', 'pickup-orders')
            ->assertJsonPath('permissions.0.can_delete', true);
    }

    public function test_any_action_implies_view(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Cleaner',
            'permissions' => [['module' => 'dinein-orders', 'can_delete' => true]],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.can_view', true)
            ->assertJsonPath('permissions.0.can_delete', true);
    }

    public function test_it_rejects_unknown_or_parent_modules(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Old',
            'permissions' => [['module' => 'orders', 'can_view' => true]],
        ])->assertUnprocessable()->assertJsonValidationErrors('permissions.0.module');
    }

    public function test_it_accepts_the_daily_close_module(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Manager',
            'permissions' => [['module' => 'daily-close', 'can_view' => true, 'can_create' => true, 'can_edit' => true]],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.module', 'daily-close')
            ->assertJsonPath('permissions.0.can_edit', true);
    }

    public function test_it_accepts_the_vendors_module(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Purchaser',
            'permissions' => [['module' => 'vendors', 'can_view' => true, 'can_create' => true, 'can_edit' => true, 'can_delete' => true]],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.module', 'vendors')
            ->assertJsonPath('permissions.0.can_delete', true);
    }

    public function test_it_accepts_the_customers_module(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Order Taker',
            'permissions' => [['module' => 'customers', 'can_view' => true, 'can_create' => true, 'can_edit' => true, 'can_delete' => false]],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.module', 'customers')
            ->assertJsonPath('permissions.0.can_edit', true);
    }

    public function test_it_accepts_the_loans_module(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Accountant',
            'permissions' => [['module' => 'loans', 'can_view' => true, 'can_create' => true, 'can_edit' => true, 'can_delete' => true]],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.module', 'loans')
            ->assertJsonPath('permissions.0.can_delete', true);
    }

    public function test_it_accepts_the_expense_modules(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Expense Clerk',
            'permissions' => [
                ['module' => 'expenses', 'can_view' => true, 'can_create' => true, 'can_edit' => true, 'can_delete' => true],
                ['module' => 'expense-categories', 'can_view' => true, 'can_create' => true, 'can_edit' => false, 'can_delete' => false],
            ],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.module', 'expenses')
            ->assertJsonPath('permissions.1.module', 'expense-categories')
            ->assertJsonPath('permissions.0.can_create', true);
    }

    public function test_it_accepts_the_employee_payments_module(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Payroll Clerk',
            'permissions' => [['module' => 'employee-payments', 'can_view' => true, 'can_create' => true, 'can_edit' => true, 'can_delete' => true]],
        ])->assertCreated()
            ->assertJsonPath('permissions.0.module', 'employee-payments')
            ->assertJsonPath('permissions.0.can_create', true);
    }

    public function test_me_exposes_delete_permission(): void
    {
        $role = Role::create(['name' => 'Waiter', 'code' => 'waiter']);
        $role->permissions()->create(['module' => 'dinein-orders', 'can_view' => true, 'can_delete' => true]);
        $user = User::forceCreate([
            'name' => 'Waiter', 'email' => 'waiter@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('permissions.dinein-orders.delete', true)
            ->assertJsonPath('permissions.dinein-orders.create', false);
    }
}
