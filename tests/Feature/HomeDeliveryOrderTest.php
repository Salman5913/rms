<?php

namespace Tests\Feature;

use App\Models\DeliveryArea;
use App\Models\Order;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HomeDeliveryOrderTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2024_01_01_000007_create_orders_and_order_items.php',
            'database/migrations/2026_11_15_000001_add_preparing_status_to_orders.php',
            'database/migrations/2026_11_15_000002_add_delete_and_sub_modules_to_role_permissions.php',
            'database/migrations/2026_11_17_000001_create_delivery_areas_table.php',
            'database/migrations/2026_11_17_000002_add_delivery_fields_to_orders.php',
            'database/migrations/2026_11_17_000003_relax_order_type_and_customer_name.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    private function items(): array
    {
        return [['product_id' => 1, 'name' => 'Burger', 'unit_price' => 500, 'qty' => 2, 'modifiers' => []]];
    }

    public function test_it_adds_the_area_charges_from_the_server_record(): void
    {
        $area = DeliveryArea::create(['name' => 'Gulberg', 'delivery_charges' => 150, 'status' => true]);

        $this->postJson('/api/admin/orders', [
            'type' => 'delivery', 'delivery_area_id' => $area->id, 'delivery_charges' => 0, 'items' => $this->items(),
        ])->assertCreated()
            ->assertJsonPath('delivery_area', 'Gulberg');

        $order = Order::first();
        $this->assertEquals(150, $order->delivery_charges);
        $this->assertEquals(1150, $order->total);

        $this->getJson('/api/admin/orders?type=delivery')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/admin/orders?type=dinein')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_area_is_required_and_must_be_active(): void
    {
        $inactive = DeliveryArea::create(['name' => 'Old Town', 'delivery_charges' => 100, 'status' => false]);

        $this->postJson('/api/admin/orders', ['type' => 'delivery', 'items' => $this->items()])
            ->assertUnprocessable()->assertJsonValidationErrors('delivery_area_id');
        $this->postJson('/api/admin/orders', ['type' => 'delivery', 'delivery_area_id' => $inactive->id, 'items' => $this->items()])
            ->assertUnprocessable()->assertJsonValidationErrors('delivery_area_id');
    }

    public function test_editing_items_keeps_the_delivery_charges(): void
    {
        $area = DeliveryArea::create(['name' => 'DHA', 'delivery_charges' => 200, 'status' => true]);
        $id = $this->postJson('/api/admin/orders', ['type' => 'delivery', 'delivery_area_id' => $area->id, 'items' => $this->items()])->json('id');

        $this->postJson("/api/admin/orders/$id", ['items' => [['name' => 'Burger', 'unit_price' => 500, 'qty' => 1]]])->assertOk();

        $this->assertEquals(700, Order::find($id)->total);
    }

    public function test_dashboard_reports_delivery_orders_and_charges(): void
    {
        $area = DeliveryArea::create(['name' => 'DHA', 'delivery_charges' => 200, 'status' => true]);
        $this->postJson('/api/admin/orders', ['type' => 'delivery', 'delivery_area_id' => $area->id, 'items' => $this->items()]);
        $this->postJson('/api/admin/orders', ['type' => 'dinein', 'items' => $this->items()]);

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('delivery_orders', 1)
            ->assertJsonPath('delivery_sales', 1200)
            ->assertJsonPath('delivery_charges', 200)
            ->assertJsonPath('dinein_orders', 1);
    }

    public function test_export_lists_delivery_charges_separately(): void
    {
        $area = DeliveryArea::create(['name' => 'DHA', 'delivery_charges' => 200, 'status' => true]);
        $this->postJson('/api/admin/orders', ['type' => 'delivery', 'delivery_area_id' => $area->id, 'items' => $this->items()]);

        $csv = $this->get('/api/admin/orders?type=delivery&export=csv')->assertOk()->streamedContent();

        $this->assertStringContainsString('order_number,delivery_area,order_amount,delivery_charges,total', $csv);
        $this->assertMatchesRegularExpression('/ON-1,DHA,1000,200(\.00)?,1200(\.00)?,/', $csv);
    }

    public function test_role_can_be_granted_home_delivery_permissions(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'Rider Desk',
            'permissions' => [['module' => 'delivery-orders', 'can_view' => true, 'can_create' => true]],
        ])->assertCreated()->assertJsonPath('permissions.0.module', 'delivery-orders');
    }
}
