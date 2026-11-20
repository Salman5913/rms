<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Orders list: ?from / ?to (created date) combined with the order type and the search box */
class OrderListFilterTest extends TestCase
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
            'database/migrations/2026_11_17_000001_create_delivery_areas_table.php',
            'database/migrations/2026_11_17_000002_add_delivery_fields_to_orders.php',
            'database/migrations/2026_11_17_000003_relax_order_type_and_customer_name.php',
            'database/migrations/2026_11_17_000004_create_labours_table.php',
            'database/migrations/2026_11_19_000003_rename_labours_to_employees.php',
            'database/migrations/2026_11_17_000005_add_rider_to_orders.php',
            'database/migrations/2026_11_17_000006_add_cancelled_status_to_orders.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));

        $this->order('ON-1', 'pickup', '2026-11-01 10:00:00', 'Ali');
        $this->order('ON-2', 'pickup', '2026-11-10 23:30:00', 'Sara');
        $this->order('ON-3', 'pickup', '2026-11-15 00:05:00', 'Ali');
        $this->order('ON-4', 'dinein', '2026-11-10 12:00:00', 'Ali');
        $this->order('ON-5', 'delivery', '2026-11-10 12:00:00', 'Ali');
    }

    private function order(string $number, string $type, string $createdAt, string $customer): void
    {
        Order::forceCreate([
            'order_number' => $number, 'type' => $type, 'customer_name' => $customer,
            'status' => 'RECEIVED', 'total' => 100, 'created_at' => $createdAt, 'updated_at' => $createdAt,
        ]);
    }

    private function numbers(string $query): array
    {
        return collect($this->getJson("/api/admin/orders?$query")->assertOk()->json('data'))
            ->pluck('order_number')->sort()->values()->all();
    }

    public function test_without_dates_all_orders_of_the_type_are_listed(): void
    {
        $this->assertSame(['ON-1', 'ON-2', 'ON-3'], $this->numbers('type=pickup'));
    }

    public function test_date_range_includes_both_days_and_keeps_the_type(): void
    {
        $this->assertSame(['ON-2', 'ON-3'], $this->numbers('type=pickup&from=2026-11-10&to=2026-11-15'));
        $this->assertSame(['ON-2'], $this->numbers('type=pickup&from=2026-11-10&to=2026-11-10'));
        $this->assertSame(['ON-4'], $this->numbers('type=dinein&from=2026-11-10&to=2026-11-10'));
        $this->assertSame(['ON-5'], $this->numbers('type=delivery&from=2026-11-10&to=2026-11-10'));
        $this->assertSame([], $this->numbers('type=website&from=2026-11-01&to=2026-11-30'));
    }

    public function test_one_sided_range(): void
    {
        $this->assertSame(['ON-2', 'ON-3'], $this->numbers('type=pickup&from=2026-11-05'));
        $this->assertSame(['ON-1', 'ON-2'], $this->numbers('type=pickup&to=2026-11-10'));
    }

    public function test_date_range_combines_with_search(): void
    {
        $this->assertSame(['ON-3'], $this->numbers('type=pickup&search=Ali&from=2026-11-05&to=2026-11-15'));
    }

    public function test_status_and_rider_filters(): void
    {
        Order::forceCreate(['order_number' => 'D-1', 'type' => 'delivery', 'status' => 'DELIVERED', 'total' => 100, 'rider_id' => 7, 'rider_name' => 'Bilal']);
        Order::forceCreate(['order_number' => 'D-2', 'type' => 'delivery', 'status' => 'OUT_FOR_DELIVERY', 'total' => 100, 'rider_id' => 7, 'rider_name' => 'Bilal']);
        Order::forceCreate(['order_number' => 'D-3', 'type' => 'delivery', 'status' => 'DELIVERED', 'total' => 100, 'rider_id' => 8, 'rider_name' => 'Asad']);

        $this->assertSame(['D-1', 'D-3'], $this->numbers('type=delivery&status=DELIVERED'));
        $this->assertSame(['D-1', 'D-2'], $this->numbers('type=delivery&rider_id=7'));
        $this->assertSame(['D-1'], $this->numbers('type=delivery&rider_id=7&status=DELIVERED'));
        $this->assertSame(['ON-5'], $this->numbers('type=delivery&rider_id=none'));   // no rider assigned
        $this->assertSame([], $this->numbers('type=website&status=DELIVERED'));          // keeps the type

        $this->getJson('/api/admin/orders?type=delivery&status=LOST')->assertStatus(422)->assertJsonValidationErrors('status');
        $this->getJson('/api/admin/orders?type=delivery&rider_id=abc')->assertStatus(422)->assertJsonValidationErrors('rider_id');
    }

    public function test_invalid_dates_are_rejected(): void
    {
        $this->getJson('/api/admin/orders?type=pickup&from=10-11-2026')->assertStatus(422)->assertJsonValidationErrors('from');
        $this->getJson('/api/admin/orders?type=pickup&from=2026-11-15&to=2026-11-10')->assertStatus(422)->assertJsonValidationErrors('to');
    }
}
