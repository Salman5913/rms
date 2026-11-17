<?php

namespace Tests\Feature;

use App\Models\DeliveryArea;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryAreaTest extends TestCase
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
            'database/migrations/2026_11_17_000001_create_delivery_areas_table.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    public function test_crud(): void
    {
        $id = $this->postJson('/api/admin/delivery-areas', ['name' => 'Gulberg', 'delivery_charges' => 150])
            ->assertCreated()
            ->assertJsonPath('status', true)
            ->json('id');

        $this->getJson('/api/admin/delivery-areas?search=gul')->assertOk()->assertJsonPath('data.0.name', 'Gulberg');

        $this->postJson("/api/admin/delivery-areas/$id", ['name' => 'DHA', 'delivery_charges' => 200, 'status' => false])
            ->assertOk()
            ->assertJsonPath('name', 'DHA')
            ->assertJsonPath('status', false);

        $this->deleteJson("/api/admin/delivery-areas/$id")->assertOk();
        $this->assertSame(0, DeliveryArea::count());
    }

    public function test_validation(): void
    {
        $this->postJson('/api/admin/delivery-areas', ['delivery_charges' => -1])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'delivery_charges']);
    }

    public function test_role_can_be_granted_delivery_area_permissions(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Dispatcher',
            'permissions' => [['module' => 'delivery-areas', 'can_view' => true, 'can_edit' => true]],
        ])->assertCreated()->assertJsonPath('permissions.0.module', 'delivery-areas');
    }
}
