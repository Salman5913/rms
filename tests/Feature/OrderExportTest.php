<?php

namespace Tests\Feature;

use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** CSV export columns per order type, with the order items in each row */
class OrderExportTest extends TestCase
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
            'database/migrations/2026_11_17_000005_add_rider_to_orders.php',
            'database/migrations/2026_11_17_000006_add_cancelled_status_to_orders.php',
            'database/migrations/2026_11_17_000007_create_daily_closes_table.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    private function items(): array
    {
        return [
            ['product_id' => 1, 'name' => 'Zinger Burger', 'unit_price' => 550, 'qty' => 2, 'modifiers' => [
                ['groupId' => -2, 'groupName' => 'Extras', 'option' => ['id' => 4, 'name' => 'Cheese', 'price' => 80]],
                ['groupId' => -1, 'groupName' => 'Options', 'option' => ['id' => 1, 'name' => 'Large', 'price' => 100]],
            ]],
            ['product_id' => 2, 'name' => 'Fries', 'unit_price' => 200, 'qty' => 1, 'modifiers' => []],
        ];
    }

    private function exportLines(string $type): array
    {
        $csv = $this->get("/api/admin/orders?type=$type&export=csv")->assertOk()->streamedContent();

        return array_map('str_getcsv', array_values(array_filter(explode("\n", $csv))));
    }

    public function test_pickup_and_dinein_exports_have_items_and_no_customer_or_status(): void
    {
        foreach (['pickup', 'dinein'] as $type) {
            $this->postJson('/api/admin/orders', [
                'type' => $type, 'customer_name' => 'Walk-in', 'customer_phone' => '0300', 'items' => $this->items(),
            ])->assertCreated();

            [$header, $row] = $this->exportLines($type);

            $this->assertSame(['order_number', 'items', 'total', 'created_at'], $header, $type);
            $this->assertSame('Zinger Burger (Cheese, Large) x 2; Fries x 1', $row[1], $type);
            $this->assertEquals(1300, $row[2], $type);
        }
    }

    public function test_website_export_keeps_customer_and_status_and_adds_items(): void
    {
        $this->postJson('/api/admin/orders', ['type' => 'website', 'items' => $this->items()])->assertCreated();

        [$header, $row] = $this->exportLines('website');

        $this->assertSame(['order_number', 'customer_name', 'customer_phone', 'items', 'status', 'total', 'delivery_charges', 'created_at'], $header);
        $this->assertSame('Zinger Burger (Cheese, Large) x 2; Fries x 1', $row[3]);
        $this->assertSame('PLACED', $row[4]);
    }
}
