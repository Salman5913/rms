<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderUpdateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs, since the
        // project's migration set creates `users` twice and can't run as a whole
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2024_01_01_000007_create_orders_and_order_items.php',
            'database/migrations/2026_11_15_000001_add_preparing_status_to_orders.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    private function makeOrder(string $type, string $status = 'RECEIVED'): Order
    {
        $order = Order::create([
            'order_number' => strtoupper($type).'-1', 'type' => $type, 'customer_name' => 'Ali',
            'status' => $status, 'total' => 500,
        ]);
        $order->items()->create(['product_id' => 1, 'name' => 'Burger', 'unit_price' => 500, 'qty' => 1, 'modifiers' => []]);

        return $order;
    }

    private function payload(): array
    {
        return ['items' => [
            ['product_id' => 1, 'name' => 'Burger', 'unit_price' => 550, 'qty' => 2,
                'modifiers' => [['groupId' => -1, 'groupName' => 'Options', 'option' => ['id' => 3, 'name' => 'Large', 'price' => 50]]]],
            ['deal_id' => 7, 'name' => 'Family Deal', 'unit_price' => 1500, 'qty' => 1, 'modifiers' => []],
        ]];
    }

    public function test_it_replaces_items_and_recalculates_total(): void
    {
        $order = $this->makeOrder('pickup');

        $this->postJson("/api/admin/orders/{$order->id}", $this->payload())
            ->assertOk()
            ->assertJsonCount(2, 'items')
            ->assertJsonPath('items.0.qty', 2)
            ->assertJsonPath('items.0.modifiers.0.option.name', 'Large');

        $this->assertEquals(2600, $order->fresh()->total);
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseMissing('order_items', ['unit_price' => 500]);
    }

    public function test_received_website_order_can_be_edited(): void
    {
        $order = $this->makeOrder('website');

        $this->postJson("/api/admin/orders/{$order->id}", $this->payload())->assertOk();
    }

    public function test_website_order_past_received_cannot_be_edited(): void
    {
        $order = $this->makeOrder('website', 'PREPARING');

        $this->postJson("/api/admin/orders/{$order->id}", $this->payload())->assertStatus(422);

        $this->assertDatabaseHas('order_items', ['order_id' => $order->id, 'unit_price' => 500]);
    }

    public function test_items_are_required(): void
    {
        $order = $this->makeOrder('pickup');

        $this->postJson("/api/admin/orders/{$order->id}", ['items' => []])
            ->assertStatus(422)->assertJsonValidationErrors('items');
    }

    public function test_status_can_be_set_to_preparing(): void
    {
        $order = $this->makeOrder('website');

        $this->postJson("/api/admin/orders/{$order->id}/status", ['status' => 'PREPARING'])
            ->assertOk()->assertJsonPath('status', 'PREPARING');
    }
}
