<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExportDateRangeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables needed, see OrderUpdateTest
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2024_01_01_000007_create_orders_and_order_items.php',
            'database/migrations/2026_11_15_000001_add_preparing_status_to_orders.php',
            'database/migrations/2024_01_01_000008_create_stock_items_and_stock_use_vouchers.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    private function stockItemOn(string $name, string $datetime): void
    {
        $item = StockItem::create(['name' => $name, 'unit' => 'kg', 'value' => 1]);
        $item->forceFill(['created_at' => Carbon::parse($datetime)])->save();
    }

    public function test_module_export_only_includes_records_created_within_the_range(): void
    {
        $this->stockItemOn('Before', '2026-10-31 23:59:59');
        $this->stockItemOn('FirstDay', '2026-11-01 00:00:00');
        $this->stockItemOn('LastDay', '2026-11-10 23:59:59');
        $this->stockItemOn('After', '2026-11-11 00:00:00');

        $res = $this->get('/api/admin/stock-items?export=csv&from=2026-11-01&to=2026-11-10')->assertOk();
        $csv = $res->streamedContent();

        $this->assertStringContainsString('FirstDay', $csv);
        $this->assertStringContainsString('LastDay', $csv);
        $this->assertStringNotContainsString('Before', $csv);
        $this->assertStringNotContainsString('After', $csv);
        $this->assertStringContainsString('StockItem_2026-11-01_to_2026-11-10.csv', $res->headers->get('Content-Disposition'));
    }

    public function test_order_export_only_includes_orders_within_the_range(): void
    {
        foreach (['IN-RANGE' => '2026-11-05 12:00:00', 'OUT-RANGE' => '2026-11-20 12:00:00'] as $number => $at) {
            $o = Order::create(['order_number' => $number, 'type' => 'website', 'customer_name' => 'Ali', 'status' => 'RECEIVED', 'total' => 100]);
            $o->forceFill(['created_at' => Carbon::parse($at)])->save();
        }

        $csv = $this->get('/api/admin/orders?type=website&export=csv&from=2026-11-01&to=2026-11-10')
            ->assertOk()->streamedContent();

        $this->assertStringContainsString('IN-RANGE', $csv);
        $this->assertStringNotContainsString('OUT-RANGE', $csv);
    }

    public function test_it_rejects_an_end_date_before_the_start_date(): void
    {
        $this->getJson('/api/admin/stock-items?export=csv&from=2026-11-10&to=2026-11-01')
            ->assertStatus(422)->assertJsonValidationErrors(['to']);
    }
}
