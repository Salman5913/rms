<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DeliveryArea;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables this test needs (orders: customers are saved from them)
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
            'database/migrations/2026_11_19_000003_rename_labours_to_employees.php',
            'database/migrations/2026_11_17_000005_add_rider_to_orders.php',
            'database/migrations/2026_11_17_000006_add_cancelled_status_to_orders.php',
            'database/migrations/2026_11_17_000007_create_daily_closes_table.php',
            'database/migrations/2026_11_20_000001_create_customers_table.php',
        ]]);

        // the customers routes use the permission middleware: act as an administrator
        $role = Role::create(['name' => 'Administrator', 'code' => 'administrator']);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    private function actAsRoleWith(string $module, array $flags): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $role->permissions()->create(['module' => $module] + $flags);
        Sanctum::actingAs(User::forceCreate([
            'name' => 'Cashier', 'email' => 'cashier@example.test', 'password' => bcrypt('password'), 'role_id' => $role->id,
        ]));
    }

    private function items(): array
    {
        return [['product_id' => 1, 'name' => 'Burger', 'unit_price' => 500, 'qty' => 2, 'modifiers' => []]];
    }

    public function test_it_creates_lists_searches_updates_and_deletes_a_customer(): void
    {
        $area = DeliveryArea::create(['name' => 'Gulberg', 'delivery_charges' => 150, 'status' => true]);

        $id = $this->postJson('/api/admin/customers', [
            'name' => 'Ali', 'phone' => '0300-123 4567', 'address' => '12 Main Blvd', 'delivery_area_id' => $area->id,
        ])->assertCreated()
            ->assertJsonPath('phone', '03001234567') // stored without spaces / dashes
            ->assertJsonPath('delivery_area.name', 'Gulberg')
            ->json('id');
        Customer::create(['name' => 'Sara', 'phone' => '03219876543']);

        $this->getJson('/api/admin/customers?search=1234567')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.name', 'Ali');

        $this->postJson("/api/admin/customers/{$id}", ['name' => 'Ali Khan', 'phone' => '03001234567', 'address' => 'House 5'])
            ->assertOk()->assertJsonPath('name', 'Ali Khan')->assertJsonPath('address', 'House 5');

        $this->deleteJson("/api/admin/customers/{$id}")->assertOk();
        $this->assertDatabaseMissing('customers', ['id' => $id]);
    }

    public function test_name_and_phone_are_required_and_the_phone_is_unique(): void
    {
        $ali = Customer::create(['name' => 'Ali', 'phone' => '03001234567']);

        $this->postJson('/api/admin/customers', [])->assertUnprocessable()->assertJsonValidationErrors(['name', 'phone']);
        // the same number written differently is still a duplicate
        $this->postJson('/api/admin/customers', ['name' => 'Other', 'phone' => '0300 1234567'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone');

        // keeping their own phone on edit is not a duplicate
        $this->postJson("/api/admin/customers/{$ali->id}", ['name' => 'Ali', 'phone' => '03001234567'])->assertOk();
    }

    public function test_the_list_query_count_does_not_grow_with_the_rows(): void
    {
        $area = DeliveryArea::create(['name' => 'DHA', 'delivery_charges' => 100, 'status' => true]);
        // warm-up: the first request also loads the acting user's role, which later requests reuse
        $this->getJson('/api/admin/customers')->assertOk();
        $countFor = function (int $rows) use ($area) {
            Customer::query()->delete();
            foreach (range(1, $rows) as $i) {
                Customer::create(['name' => "C{$i}", 'phone' => "0300{$i}", 'delivery_area_id' => $area->id]);
            }
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/admin/customers?per_page=50')->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $this->assertSame($countFor(5), $countFor(50));
    }

    public function test_the_lookup_returns_the_customer_of_a_phone_or_null(): void
    {
        Customer::create(['name' => 'Ali', 'phone' => '03001234567', 'address' => '12 Main Blvd', 'delivery_area_id' => 3]);

        $this->getJson('/api/admin/customers-lookup?phone=0300-1234567')
            ->assertOk()
            ->assertJsonPath('customer.name', 'Ali')
            ->assertJsonPath('customer.address', '12 Main Blvd')
            ->assertJsonPath('customer.delivery_area_id', 3);

        $this->getJson('/api/admin/customers-lookup?phone=03110000000')->assertOk()->assertJsonPath('customer', null);
        $this->getJson('/api/admin/customers-lookup')->assertUnprocessable()->assertJsonValidationErrors('phone');
    }

    public function test_a_home_delivery_order_saves_a_new_customer_once(): void
    {
        $area = DeliveryArea::create(['name' => 'Gulberg', 'delivery_charges' => 150, 'status' => true]);
        $order = ['type' => 'delivery', 'customer_name' => 'Ali', 'customer_phone' => '0300 1234567',
            'address' => '12 Main Blvd', 'delivery_area_id' => $area->id, 'items' => $this->items()];

        $this->postJson('/api/admin/orders', $order)->assertCreated();
        $this->assertDatabaseHas('customers', [
            'name' => 'Ali', 'phone' => '03001234567', 'address' => '12 Main Blvd', 'delivery_area_id' => $area->id,
        ]);

        // the next order of the same phone doesn't add or change the customer
        $this->postJson('/api/admin/orders', ['customer_name' => 'Someone else', 'address' => 'Elsewhere'] + $order)->assertCreated();
        $this->assertSame(1, Customer::count());
        $this->assertDatabaseHas('customers', ['phone' => '03001234567', 'name' => 'Ali']);
    }

    public function test_walk_in_orders_do_not_save_customers(): void
    {
        $this->postJson('/api/admin/orders', ['type' => 'pickup', 'customer_phone' => '03001234567', 'items' => $this->items()])
            ->assertCreated();

        $this->assertSame(0, Customer::count());
    }

    public function test_a_website_order_saves_a_new_customer(): void
    {
        $this->postJson('/api/orders', [
            'customer_name' => 'Sara', 'customer_phone' => '03219876543', 'address' => 'Flat 2, Block B', 'items' => $this->items(),
        ])->assertCreated()->assertJsonStructure(['orderId']);

        $this->assertDatabaseHas('customers', ['name' => 'Sara', 'phone' => '03219876543', 'address' => 'Flat 2, Block B']);
    }

    public function test_it_needs_the_customers_permission(): void
    {
        $this->actAsRoleWith('customers', ['can_view' => true, 'can_create' => false, 'can_edit' => false, 'can_delete' => false]);

        $this->getJson('/api/admin/customers')->assertOk();
        $this->postJson('/api/admin/customers', ['name' => 'Ali', 'phone' => '03001234567'])->assertForbidden();
        $this->assertDatabaseMissing('customers', ['phone' => '03001234567']);
        // the lookup belongs to the home delivery create page, not the customers module
        $this->getJson('/api/admin/customers-lookup?phone=03001234567')->assertForbidden();
    }

    public function test_the_lookup_needs_delivery_order_create_permission(): void
    {
        $this->actAsRoleWith('delivery-orders', ['can_view' => true, 'can_create' => true, 'can_edit' => false, 'can_delete' => false]);

        $this->getJson('/api/admin/customers-lookup?phone=03001234567')->assertOk()->assertJsonPath('customer', null);
        $this->getJson('/api/admin/customers')->assertForbidden();
    }
}
