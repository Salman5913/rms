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
