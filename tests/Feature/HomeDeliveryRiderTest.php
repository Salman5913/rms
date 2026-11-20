<?php

namespace Tests\Feature;

use App\Models\DeliveryArea;
use App\Models\Employee;
use App\Models\Order;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** home delivery: customer details, rider assignment and the delivery status flow */
class HomeDeliveryRiderTest extends TestCase
{
    private DeliveryArea $area;

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
            'database/migrations/2026_11_17_000004_create_labours_table.php',
            'database/migrations/2026_11_19_000003_rename_labours_to_employees.php',
            'database/migrations/2026_11_17_000005_add_rider_to_orders.php',
            'database/migrations/2026_11_17_000006_add_cancelled_status_to_orders.php',
            'database/migrations/2026_11_17_000007_create_daily_closes_table.php',
            // delivery and website orders save first-time customers
            'database/migrations/2026_11_20_000001_create_customers_table.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));

        $this->area = DeliveryArea::create(['name' => 'Gulberg', 'delivery_charges' => 150, 'status' => true]);
    }

    private function employee(array $attrs = []): Employee
    {
        return Employee::create($attrs + ['name' => 'Bilal', 'phone' => '03111111111', 'user_type' => 'rider', 'pay_type' => 'daily', 'status' => true]);
    }

    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'type' => 'delivery',
            'delivery_area_id' => $this->area->id,
            'customer_name' => 'Ali',
            'customer_phone' => '03001234567',
            'address' => '12 Main Blvd',
            'items' => [['product_id' => 1, 'name' => 'Burger', 'unit_price' => 500, 'qty' => 2, 'modifiers' => []]],
        ];
    }

    public function test_delivery_order_requires_customer_name_phone_and_address(): void
    {
        $this->postJson('/api/admin/orders', ['customer_name' => '', 'customer_phone' => null, 'address' => ''] + $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['customer_name', 'customer_phone', 'address']);

        $this->assertSame(0, Order::count());
    }

    public function test_pickup_orders_still_need_no_customer_details(): void
    {
        $this->postJson('/api/admin/orders', ['type' => 'pickup', 'items' => $this->payload()['items']])->assertCreated();
    }

    public function test_it_saves_customer_details_and_a_rider_name_snapshot(): void
    {
        $rider = $this->employee();

        $this->postJson('/api/admin/orders', $this->payload(['rider_id' => $rider->id, 'rider_name' => 'Spoofed']))
            ->assertCreated()
            ->assertJsonPath('customer_name', 'Ali')
            ->assertJsonPath('address', '12 Main Blvd')
            ->assertJsonPath('rider_id', $rider->id)
            ->assertJsonPath('rider_name', 'Bilal');

        // snapshot: renaming the employee later doesn't change the order
        $rider->update(['name' => 'Bilal Khan']);
        $this->assertSame('Bilal', Order::first()->rider_name);
    }

    public function test_rider_is_optional(): void
    {
        $this->postJson('/api/admin/orders', $this->payload())
            ->assertCreated()
            ->assertJsonPath('rider_id', null)
            ->assertJsonPath('rider_name', null);
    }

    public function test_it_rejects_a_non_rider_or_inactive_employee(): void
    {
        $cook = $this->employee(['name' => 'Cook', 'user_type' => 'cook']);
        $inactive = $this->employee(['name' => 'Gone', 'status' => false]);

        foreach ([$cook->id, $inactive->id, 999] as $id) {
            $this->postJson('/api/admin/orders', $this->payload(['rider_id' => $id]))
                ->assertUnprocessable()->assertJsonValidationErrors('rider_id');
        }
        $this->assertSame(0, Order::count());
    }

    public function test_update_changes_customer_fields_and_rider_and_keeps_totals_right(): void
    {
        $first = $this->employee();
        $second = $this->employee(['name' => 'Hamza']);
        $id = $this->postJson('/api/admin/orders', $this->payload(['rider_id' => $first->id]))->json('id');

        $this->postJson("/api/admin/orders/$id", [
            'items' => [['name' => 'Burger', 'unit_price' => 500, 'qty' => 3]],
            'customer_name' => 'Sara',
            'customer_phone' => '03219876543',
            'address' => '5 Canal Road',
            'rider_id' => $second->id,
        ])->assertOk()
            ->assertJsonPath('customer_name', 'Sara')
            ->assertJsonPath('rider_name', 'Hamza');

        $order = Order::find($id);
        $this->assertSame('03219876543', $order->customer_phone);
        $this->assertSame('5 Canal Road', $order->address);
        $this->assertSame($second->id, $order->rider_id);
        $this->assertEquals(150, $order->delivery_charges);
        $this->assertEquals(1500, $order->total);

        // clearing the rider (allowed while the order is still RECEIVED)
        $this->postJson("/api/admin/orders/$id", ['items' => [['name' => 'Burger', 'unit_price' => 500, 'qty' => 3]], 'rider_id' => null])
            ->assertOk()->assertJsonPath('rider_id', null)->assertJsonPath('rider_name', null);
    }

    public function test_update_rejects_blank_customer_fields_and_bad_rider(): void
    {
        $cook = $this->employee(['user_type' => 'cook']);
        $id = $this->postJson('/api/admin/orders', $this->payload())->json('id');

        $this->postJson("/api/admin/orders/$id", [
            'items' => [['name' => 'Burger', 'unit_price' => 500, 'qty' => 1]],
            'customer_name' => '', 'rider_id' => $cook->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['customer_name', 'rider_id']);
    }

    public function test_out_for_delivery_needs_a_rider(): void
    {
        $id = $this->postJson('/api/admin/orders', $this->payload())->json('id');

        $this->postJson("/api/admin/orders/$id/status", ['status' => 'OUT_FOR_DELIVERY'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Assign a rider before marking this order Out for delivery.');
        $this->assertSame('RECEIVED', Order::find($id)->status);

        $rider = $this->employee();
        $this->postJson("/api/admin/orders/$id/rider", ['rider_id' => $rider->id])
            ->assertOk()->assertJsonPath('rider_name', 'Bilal');

        $this->postJson("/api/admin/orders/$id/status", ['status' => 'OUT_FOR_DELIVERY'])->assertOk();
        $this->postJson("/api/admin/orders/$id/status", ['status' => 'DELIVERED'])->assertOk();
        $this->assertSame('DELIVERED', Order::find($id)->status);
    }

    public function test_out_for_delivery_order_must_keep_its_rider(): void
    {
        $rider = $this->employee();
        $id = $this->postJson('/api/admin/orders', $this->payload(['rider_id' => $rider->id]))->json('id');
        $this->postJson("/api/admin/orders/$id/status", ['status' => 'OUT_FOR_DELIVERY'])->assertOk();

        $this->postJson("/api/admin/orders/$id/rider", ['rider_id' => null])->assertUnprocessable();
        $this->assertSame($rider->id, Order::find($id)->rider_id);
    }

    public function test_delivery_orders_only_use_the_delivery_statuses(): void
    {
        $id = $this->postJson('/api/admin/orders', $this->payload())->json('id');

        $this->postJson("/api/admin/orders/$id/status", ['status' => 'PREPARING'])->assertUnprocessable();

        // other order types are unchanged
        $pickup = $this->postJson('/api/admin/orders', ['type' => 'pickup', 'items' => $this->payload()['items']])->json('id');
        $this->postJson("/api/admin/orders/$pickup/status", ['status' => 'PREPARING'])->assertOk();
        $this->postJson("/api/admin/orders/$pickup/status", ['status' => 'OUT_FOR_DELIVERY'])->assertOk();
    }

    private function websiteOrder(): Order
    {
        $order = Order::create([
            'order_number' => 'WEB-1', 'type' => 'website', 'status' => 'RECEIVED', 'total' => 1000,
            'customer_name' => 'Web Ali', 'customer_phone' => '0333', 'address' => '1 Web St',
        ]);
        $order->items()->create(['name' => 'Burger', 'unit_price' => 500, 'qty' => 2]);

        return $order;
    }

    public function test_website_orders_get_riders_and_need_one_to_go_out(): void
    {
        $order = $this->websiteOrder();

        $this->postJson("/api/admin/orders/{$order->id}/status", ['status' => 'OUT_FOR_DELIVERY'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Assign a rider before marking this order Out for delivery.');

        // website orders keep their own statuses
        $this->postJson("/api/admin/orders/{$order->id}/status", ['status' => 'PREPARING'])->assertOk();

        $rider = $this->employee();
        $this->postJson("/api/admin/orders/{$order->id}/rider", ['rider_id' => $rider->id])
            ->assertOk()->assertJsonPath('rider_name', 'Bilal');
        $this->postJson("/api/admin/orders/{$order->id}/status", ['status' => 'OUT_FOR_DELIVERY'])->assertOk();

        $this->postJson("/api/admin/orders/{$order->id}/rider", ['rider_id' => null])->assertUnprocessable();
    }

    public function test_website_order_edit_changes_customer_fields_and_rider(): void
    {
        $order = $this->websiteOrder();
        $rider = $this->employee();

        $this->postJson("/api/admin/orders/{$order->id}", [
            'items' => [['name' => 'Burger', 'unit_price' => 500, 'qty' => 1]],
            'customer_name' => 'Web Sara', 'customer_phone' => '0344', 'address' => '2 Web St', 'rider_id' => $rider->id,
        ])->assertOk()
            ->assertJsonPath('customer_name', 'Web Sara')
            ->assertJsonPath('address', '2 Web St')
            ->assertJsonPath('rider_name', 'Bilal');

        $this->assertEquals(500, $order->fresh()->total);
    }

    public function test_website_order_edit_sets_and_clears_the_delivery_area(): void
    {
        $order = $this->websiteOrder();
        $items = [['name' => 'Burger', 'unit_price' => 500, 'qty' => 2]];

        $this->postJson("/api/admin/orders/{$order->id}", ['items' => $items, 'delivery_area_id' => $this->area->id])
            ->assertOk()->assertJsonPath('delivery_area', 'Gulberg');
        $this->assertEquals(150, $order->fresh()->delivery_charges);
        $this->assertEquals(1000, $order->fresh()->total);

        // website orders may have no area
        $this->postJson("/api/admin/orders/{$order->id}", ['items' => $items, 'delivery_area_id' => null])->assertOk();
        $this->assertNull($order->fresh()->delivery_area);
        $this->assertEquals(1000, $order->fresh()->total);
    }

    public function test_delivery_order_edit_changes_area_and_charges(): void
    {
        $id = $this->postJson('/api/admin/orders', $this->payload())->json('id');
        $items = [['name' => 'Burger', 'unit_price' => 500, 'qty' => 2]];
        $dha = DeliveryArea::create(['name' => 'DHA', 'delivery_charges' => 300, 'status' => true]);

        // same area keeps the charges the order was placed with, even if the area changed or was disabled since
        $this->area->update(['delivery_charges' => 999, 'status' => false]);
        $this->postJson("/api/admin/orders/$id", ['items' => $items, 'delivery_area_id' => $this->area->id])->assertOk();
        $this->assertEquals(1000, Order::find($id)->total);
        $this->assertEquals(150, Order::find($id)->delivery_charges);

        $this->postJson("/api/admin/orders/$id", ['items' => $items, 'delivery_area_id' => $dha->id])
            ->assertOk()->assertJsonPath('delivery_area', 'DHA');
        $this->assertEquals(300, Order::find($id)->delivery_charges);
        $this->assertEquals(1000, Order::find($id)->total);

        // an inactive area that isn't the order's own, or no area at all, is refused
        $this->postJson("/api/admin/orders/$id", ['items' => $items, 'delivery_area_id' => $this->area->id])
            ->assertUnprocessable()->assertJsonValidationErrors('delivery_area_id');
        $this->postJson("/api/admin/orders/$id", ['items' => $items, 'delivery_area_id' => null])->assertUnprocessable();
    }

    public function test_website_and_delivery_orders_can_be_cancelled_but_pickup_cannot(): void
    {
        $delivery = $this->postJson('/api/admin/orders', $this->payload())->json('id');
        $website = $this->websiteOrder()->id;
        $pickup = $this->postJson('/api/admin/orders', ['type' => 'pickup', 'items' => $this->payload()['items']])->json('id');

        $this->postJson("/api/admin/orders/$delivery/status", ['status' => 'CANCELLED'])->assertOk()->assertJsonPath('status', 'CANCELLED');
        $this->postJson("/api/admin/orders/$website/status", ['status' => 'CANCELLED'])->assertOk();
        $this->postJson("/api/admin/orders/$pickup/status", ['status' => 'CANCELLED'])->assertUnprocessable();

        $this->getJson('/api/orders/WEB-1/status')->assertOk()->assertJsonPath('status', 'CANCELLED');
    }

    public function test_dashboard_counts_website_and_delivery_sales_only_when_delivered(): void
    {
        $rider = $this->employee();
        // delivery: 1000, plus 150 charges kept out of the total
        $delivered = $this->postJson('/api/admin/orders', $this->payload(['rider_id' => $rider->id]))->json('id');
        $this->postJson('/api/admin/orders', $this->payload());                         // still received
        $cancelled = $this->postJson('/api/admin/orders', $this->payload())->json('id');
        $this->postJson("/api/admin/orders/$cancelled/status", ['status' => 'CANCELLED']);
        $this->postJson("/api/admin/orders/$delivered/status", ['status' => 'OUT_FOR_DELIVERY']);

        $web = $this->websiteOrder();                                                 // 1000, received
        $this->postJson('/api/admin/orders', ['type' => 'pickup', 'items' => $this->payload()['items']]); // 1000

        // pending / cancelled website and delivery orders are left out of counts and sales alike
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('delivery_orders', 0)
            ->assertJsonPath('delivery_sales', 0)
            ->assertJsonPath('website_orders', 0)
            ->assertJsonPath('website_sales', 0)
            ->assertJsonPath('pickup_orders', 1)
            ->assertJsonPath('total_orders', 1)
            ->assertJsonPath('total_sales', 1000)
            ->assertJsonPath('chart.orders.0', 1)
            ->assertJsonPath('chart.revenue.0', 1000);

        $this->postJson("/api/admin/orders/$delivered/status", ['status' => 'DELIVERED'])->assertOk();
        $web->update(['status' => 'DELIVERED']);

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('delivery_sales', 1000)
            ->assertJsonPath('website_sales', 1000)
            ->assertJsonPath('delivery_charges', 150)
            ->assertJsonPath('pickup_sales', 1000)
            ->assertJsonPath('total_sales', 3000)
            ->assertJsonPath('delivery_orders', 1)
            ->assertJsonPath('website_orders', 1)
            ->assertJsonPath('total_orders', 3)
            ->assertJsonPath('chart.orders.0', 3)
            ->assertJsonPath('chart.revenue.0', 3000);
    }

    public function test_riders_cannot_be_assigned_to_pickup_orders(): void
    {
        $id = $this->postJson('/api/admin/orders', ['type' => 'pickup', 'items' => $this->payload()['items']])->json('id');

        $this->postJson("/api/admin/orders/$id/rider", ['rider_id' => $this->employee()->id])->assertUnprocessable();
    }

    public function test_riders_endpoint_lists_only_active_riders(): void
    {
        $this->employee(['name' => 'Zain']);
        $this->employee(['name' => 'Asad']);
        $this->employee(['name' => 'Off Duty', 'status' => false]);
        $this->employee(['name' => 'Chef', 'user_type' => 'cook']);

        $this->getJson('/api/admin/riders')->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.name', 'Asad')
            ->assertJsonPath('1.name', 'Zain')
            ->assertJsonStructure([['id', 'name', 'phone']]);
    }

    public function test_riders_endpoint_can_include_disabled_riders_for_the_list_filter(): void
    {
        $this->employee(['name' => 'Zain']);
        $this->employee(['name' => 'Off Duty', 'status' => false]);
        $this->employee(['name' => 'Chef', 'user_type' => 'cook']);

        $this->getJson('/api/admin/riders?all=1')->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.name', 'Off Duty')
            ->assertJsonPath('1.name', 'Zain');
    }

    public function test_search_matches_address_and_export_has_customer_and_rider(): void
    {
        $rider = $this->employee();
        $this->postJson('/api/admin/orders', $this->payload(['rider_id' => $rider->id, 'address' => 'House 7, Johar Town']));
        $this->postJson('/api/admin/orders', $this->payload(['address' => 'Model Town']));

        $this->getJson('/api/admin/orders?type=delivery&search=johar')->assertOk()->assertJsonCount(1, 'data');

        $csv = $this->get('/api/admin/orders?type=delivery&export=csv')->assertOk()->streamedContent();
        $this->assertStringContainsString('customer_name,customer_phone,address,rider_name', $csv);
        $this->assertStringContainsString('Ali,03001234567,"House 7, Johar Town",Bilal', $csv);
    }
}
