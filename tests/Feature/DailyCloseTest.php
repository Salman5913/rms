<?php

namespace Tests\Feature;

use App\Models\DailyClose;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DailyCloseTest extends TestCase
{
    private const DAY = '2026-11-16';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2024_01_01_000007_create_orders_and_order_items.php',
            'database/migrations/2026_11_04_140948_create_personal_access_tokens_table.php',
            'database/migrations/2026_11_15_000001_add_preparing_status_to_orders.php',
            'database/migrations/2026_11_15_000002_add_delete_and_sub_modules_to_role_permissions.php',
            'database/migrations/2026_11_17_000001_create_delivery_areas_table.php',
            'database/migrations/2026_11_17_000002_add_delivery_fields_to_orders.php',
            'database/migrations/2026_11_17_000003_relax_order_type_and_customer_name.php',
            'database/migrations/2026_11_17_000004_create_labours_table.php',
            'database/migrations/2026_11_17_000005_add_rider_to_orders.php',
            'database/migrations/2026_11_17_000006_add_cancelled_status_to_orders.php',
            'database/migrations/2026_11_17_000007_create_daily_closes_table.php',
        ]]);

        // the daily-close routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        $this->admin = User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]);
        Sanctum::actingAs($this->admin);

        // "now" is the evening of the business day
        $this->travelTo(Carbon::parse(self::DAY.' 22:00:00'));
    }

    /** an order created at $time on the business day, with one item per [name, unit_price, qty] */
    private function order(string $type, string $status, float $total, array $items = [], array $attrs = [], string $time = '12:00:00'): Order
    {
        static $n = 0;
        $order = new Order($attrs + [
            'order_number' => strtoupper($type).'-'.(++$n), 'type' => $type, 'status' => $status, 'total' => $total,
        ]);
        $order->created_at = Carbon::parse(self::DAY.' '.$time);
        $order->save();
        foreach ($items as [$name, $price, $qty]) {
            $order->items()->create(['name' => $name, 'unit_price' => $price, 'qty' => $qty, 'modifiers' => []]);
        }

        return $order;
    }

    private function close(array $body = []): TestResponse
    {
        return $this->postJson('/api/admin/daily-close', $body + ['date' => self::DAY]);
    }

    private function actAsRoleWith(array $flags): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => 'daily-close'] + $flags);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    /* ---------- sales rules ---------- */

    public function test_sales_rules(): void
    {
        $this->order('pickup', 'RECEIVED', 100);
        $this->order('dinein', 'RECEIVED', 200);
        $this->order('website', 'DELIVERED', 300, [], ['delivery_area' => 'DHA', 'delivery_charges' => 100, 'rider_name' => 'Asad']);
        $this->order('website', 'RECEIVED', 999, [], ['delivery_area' => 'DHA', 'delivery_charges' => 100]);   // pending: not counted
        $this->order('website', 'CANCELLED', 50, [], ['delivery_area' => 'DHA', 'delivery_charges' => 100]);
        $this->order('delivery', 'DELIVERED', 400, [], ['delivery_area' => 'Gulberg', 'delivery_charges' => 150, 'rider_name' => 'Bilal']);
        $this->order('delivery', 'OUT_FOR_DELIVERY', 888, [], ['delivery_area' => 'Gulberg', 'delivery_charges' => 150]);
        $this->order('delivery', 'CANCELLED', 70, [], ['delivery_area' => 'DHA', 'delivery_charges' => 100]);
        // another day: ignored
        $this->order('pickup', 'RECEIVED', 5000)->forceFill(['created_at' => Carbon::parse('2026-11-15 12:00')])->save();

        $s = $this->getJson('/api/admin/daily-close?date='.self::DAY)->assertOk()
            ->assertJsonPath('status', 'open')
            ->json('summary');

        $this->assertEquals(1000, $s['total_sales']);                 // 100 + 200 + 300 + 400, charges not included
        $this->assertSame(4, $s['orders_counted']);
        $this->assertEquals(250, $s['delivery_charges']);             // delivered website + home delivery orders only
        $this->assertEquals(1250, $s['total_collected']);
        $this->assertEquals([100, 200, 300, 400], array_column($s['sales_by_type'], 'amount'));
        $this->assertEquals([
            ['name' => 'Gulberg', 'orders' => 1, 'amount' => 150],
            ['name' => 'DHA', 'orders' => 1, 'amount' => 100],
        ], $s['delivery_charges_by_area']);
        $this->assertEquals([
            ['name' => 'Bilal', 'orders' => 1, 'amount' => 150],
            ['name' => 'Asad', 'orders' => 1, 'amount' => 100],
        ], $s['delivery_charges_by_rider']);
        $this->assertEquals([50, 70], array_column($s['cancelled'], 'amount'));
    }

    public function test_item_wise_sales_group_by_name_and_skip_undelivered_orders(): void
    {
        $this->order('pickup', 'RECEIVED', 1100, [['Burger', 500, 2], ['Fries', 100, 1]]);
        $this->order('dinein', 'RECEIVED', 3000, [['Burger', 550, 1], ['Family Deal', 1500, 1]]);
        $this->order('website', 'DELIVERED', 200, [['Fries', 100, 2]]);
        $this->order('website', 'RECEIVED', 5000, [['Burger', 500, 10]]);     // pending
        $this->order('delivery', 'CANCELLED', 1500, [['Family Deal', 1500, 1]]);

        $items = $this->getJson('/api/admin/daily-close?date='.self::DAY)->json('summary.items');

        // grouped by name across orders, amount = unit_price x qty, sorted by amount desc
        $this->assertSame(['Burger', 'Family Deal', 'Fries'], array_column($items, 'name'));
        $this->assertEquals([3, 1, 3], array_column($items, 'qty'));
        $this->assertEquals([1550, 1500, 300], array_column($items, 'amount'));
    }

    /* ---------- closing ---------- */

    public function test_future_date_cannot_be_closed(): void
    {
        $this->close(['date' => '2026-11-17'])->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->assertSame(0, DailyClose::count());
    }

    public function test_pending_website_and_delivery_orders_block_the_close(): void
    {
        $this->order('pickup', 'RECEIVED', 100);
        $web = $this->order('website', 'PREPARING', 300);
        $del = $this->order('delivery', 'OUT_FOR_DELIVERY', 400);
        $this->order('delivery', 'CANCELLED', 400);

        $this->close()->assertUnprocessable()
            ->assertJsonCount(2, 'blocking_orders')
            ->assertJsonPath('blocking_orders.0.order_number', $web->order_number)
            ->assertJsonPath('blocking_orders.1.order_number', $del->order_number);
        $this->assertSame(0, DailyClose::count());

        $this->getJson('/api/admin/daily-close?date='.self::DAY)->assertJsonCount(2, 'blocking_orders');
    }

    public function test_close_saves_a_snapshot_that_later_changes_do_not_touch(): void
    {
        $order = $this->order('pickup', 'RECEIVED', 100, [['Burger', 100, 1]]);

        $this->close(['cash_counted' => 95, 'notes' => 'Short by 5'])->assertCreated()
            ->assertJsonPath('status', 'closed')
            ->assertJsonPath('closed_by.name', 'Admin');

        // a change straight in the database (bypassing the lock) does not alter the snapshot
        $order->update(['total' => 9999]);

        $this->getJson('/api/admin/daily-close?date='.self::DAY)->assertOk()
            ->assertJsonPath('status', 'closed')
            ->assertJsonPath('summary.total_sales', 100)
            ->assertJsonPath('summary.items.0.name', 'Burger')
            ->assertJsonPath('close.cash_counted', '95.00')
            ->assertJsonPath('close.notes', 'Short by 5');
    }

    public function test_an_already_closed_date_cannot_be_closed_again(): void
    {
        $this->close()->assertCreated();
        $this->close()->assertUnprocessable()->assertJsonPath('message', 'This day is already closed.');

        $this->assertSame(1, DailyClose::active()->count());
    }

    public function test_history_lists_closes(): void
    {
        $this->order('pickup', 'RECEIVED', 250);
        $this->close()->assertCreated();

        $this->getJson('/api/admin/daily-closes')->assertOk()
            ->assertJsonPath('data.0.business_date', self::DAY)
            ->assertJsonPath('data.0.total_sales', 250)
            ->assertJsonPath('data.0.closed_by.name', 'Admin')
            ->assertJsonMissingPath('data.0.summary');
    }

    /* ---------- locking ---------- */

    public function test_orders_of_a_closed_day_are_locked(): void
    {
        $order = $this->order('pickup', 'RECEIVED', 100, [['Burger', 100, 1]]);
        $other = $this->order('dinein', 'RECEIVED', 100);
        $this->close()->assertCreated();
        $msg = 'This day is closed. Reopen it to make changes.';

        $this->postJson("/api/admin/orders/{$order->id}", ['items' => [['name' => 'Burger', 'unit_price' => 1, 'qty' => 1]]])
            ->assertUnprocessable()->assertJsonPath('message', $msg);
        $this->postJson("/api/admin/orders/{$order->id}/status", ['status' => 'READY'])
            ->assertUnprocessable()->assertJsonPath('message', $msg);
        $this->deleteJson("/api/admin/orders/{$order->id}")
            ->assertUnprocessable()->assertJsonPath('message', $msg);
        $this->postJson('/api/admin/orders-bulk-delete', ['ids' => [$order->id, $other->id]])
            ->assertUnprocessable()->assertJsonPath('message', $msg);

        $this->assertSame(2, Order::count());
        $this->assertEquals(100, $order->fresh()->total);
    }

    public function test_order_placed_after_the_close_is_not_locked(): void
    {
        $this->close()->assertCreated();

        $this->travel(30)->minutes();
        $late = $this->order('website', 'RECEIVED', 300, [], [], '22:30:00');

        $this->getJson('/api/admin/daily-close?date='.self::DAY)
            ->assertJsonCount(1, 'placed_after_close')
            ->assertJsonPath('placed_after_close.0.order_number', $late->order_number);
        $this->postJson("/api/admin/orders/{$late->id}/status", ['status' => 'PREPARING'])->assertOk();
    }

    public function test_admin_orders_are_refused_while_today_is_closed_but_website_orders_are_not(): void
    {
        $this->close()->assertCreated();
        $items = [['product_id' => 1, 'name' => 'Burger', 'unit_price' => 500, 'qty' => 1]];

        $this->postJson('/api/admin/orders', ['type' => 'pickup', 'items' => $items])
            ->assertUnprocessable()->assertJsonPath('message', 'Today is closed. Reopen it to add orders.');

        $this->postJson('/api/orders', [
            'customer_name' => 'Ali', 'customer_phone' => '0300', 'address' => '12 Main', 'items' => $items,
        ])->assertCreated();

        $this->assertSame(1, Order::where('type', 'website')->count());
        $this->assertSame(0, Order::where('type', 'pickup')->count());
    }

    /* ---------- reopening ---------- */

    public function test_reopen_needs_a_reason_unlocks_orders_and_allows_closing_again(): void
    {
        $order = $this->order('pickup', 'RECEIVED', 100);
        $id = $this->close()->assertCreated()->json('id');

        $this->postJson("/api/admin/daily-close/{$id}/reopen", ['reason' => ''])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');

        $this->postJson("/api/admin/daily-close/{$id}/reopen", ['reason' => 'Wrong bill'])->assertOk()
            ->assertJsonPath('status', 'reopened')
            ->assertJsonPath('reopen_reason', 'Wrong bill')
            ->assertJsonPath('reopened_by.name', 'Admin');

        $this->postJson("/api/admin/orders/{$order->id}/status", ['status' => 'READY'])->assertOk();
        $this->getJson('/api/admin/daily-close?date='.self::DAY)->assertJsonPath('status', 'reopened');

        $this->close()->assertCreated();
        $this->assertSame(1, DailyClose::active()->count());
        $this->assertSame(2, DailyClose::count());
    }

    /* ---------- permissions ---------- */

    public function test_user_without_create_permission_cannot_close(): void
    {
        $this->actAsRoleWith(['can_view' => true]);

        $this->getJson('/api/admin/daily-close?date='.self::DAY)->assertOk();
        $this->close()->assertForbidden();
    }

    public function test_user_without_edit_permission_cannot_reopen(): void
    {
        $id = $this->close()->assertCreated()->json('id');
        $this->actAsRoleWith(['can_view' => true, 'can_create' => true]);

        $this->postJson("/api/admin/daily-close/{$id}/reopen", ['reason' => 'x'])->assertForbidden();
    }

    public function test_user_without_view_permission_cannot_see_the_page(): void
    {
        Sanctum::actingAs(User::forceCreate(['name' => 'Nobody', 'email' => 'no@example.test', 'password' => bcrypt('x')]));

        $this->getJson('/api/admin/daily-close')->assertForbidden();
        $this->getJson('/api/admin/daily-closes')->assertForbidden();
    }
}
