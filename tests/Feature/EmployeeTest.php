<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeTest extends TestCase
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
            'database/migrations/2026_11_17_000004_create_labours_table.php',
            'database/migrations/2026_11_18_000004_create_labour_payments_table.php',
            'database/migrations/2026_11_19_000001_add_user_type_other_to_labours_table.php',
            'database/migrations/2026_11_19_000003_rename_labours_to_employees.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    public function test_crud(): void
    {
        $id = $this->postJson('/api/admin/employees', [
            'name' => 'Bilal', 'phone' => '03111111111', 'cnic' => '35202-1234567-1',
            'user_type' => 'rider', 'pay_type' => 'monthly', 'pay_rate' => 30000,
        ])->assertCreated()
            ->assertJsonPath('status', true)
            ->assertJsonPath('user_type', 'rider')
            ->json('id');

        $this->getJson('/api/admin/employees?search=bil')->assertOk()->assertJsonPath('data.0.name', 'Bilal');
        $this->getJson("/api/admin/employees/$id")->assertOk()->assertJsonPath('cnic', '35202-1234567-1');

        $this->postJson("/api/admin/employees/$id", [
            'name' => 'Bilal Khan', 'user_type' => 'cook', 'pay_type' => 'daily', 'pay_rate' => 1500, 'status' => false,
        ])->assertOk()
            ->assertJsonPath('name', 'Bilal Khan')
            ->assertJsonPath('pay_type', 'daily')
            ->assertJsonPath('status', false);

        $this->deleteJson("/api/admin/employees/$id")->assertOk();
        $this->assertSame(0, Employee::count());
    }

    public function test_pay_rate_defaults_to_zero(): void
    {
        $this->postJson('/api/admin/employees', ['name' => 'Asad', 'user_type' => 'waiter', 'pay_type' => 'weekly'])
            ->assertCreated();

        $this->assertEquals(0, Employee::first()->pay_rate);
    }

    public function test_validation(): void
    {
        $this->postJson('/api/admin/employees', ['user_type' => 'pilot', 'pay_type' => 'yearly', 'pay_rate' => -5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'user_type', 'pay_type', 'pay_rate']);
    }

    public function test_list_can_be_filtered_by_user_type(): void
    {
        Employee::create(['name' => 'Rider One', 'user_type' => 'rider', 'pay_type' => 'daily']);
        Employee::create(['name' => 'Cook One', 'user_type' => 'cook', 'pay_type' => 'monthly']);

        $this->getJson('/api/admin/employees?user_type=cook')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Cook One');
        $this->getJson('/api/admin/employees')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_it_imports_employees_from_csv_and_updates_by_name(): void
    {
        Employee::create(['name' => 'Bilal', 'phone' => '0300', 'user_type' => 'rider', 'pay_type' => 'monthly', 'pay_rate' => 25000]);

        $file = UploadedFile::fake()->createWithContent('employees.csv',
            "name,phone,cnic,user_type,pay_type,pay_rate,status\n".
            "Bilal,,,rider,monthly,30000,1\n".
            "Asad,03111111111,35202-1,cook,daily,1500,no\n".
            "Zain,,,waiter,weekly,,\n");

        $this->post('/api/admin/import/employees', ['file' => $file])
            ->assertOk()->assertJson(['ok' => true, 'created' => 2, 'updated' => 1]);

        // existing record updated; blank phone kept
        $bilal = Employee::where('name', 'Bilal')->first();
        $this->assertEquals(30000, $bilal->pay_rate);
        $this->assertSame('0300', $bilal->phone);

        $this->assertDatabaseHas('employees', ['name' => 'Asad', 'user_type' => 'cook', 'pay_type' => 'daily', 'status' => 0]);
        $this->assertDatabaseHas('employees', ['name' => 'Zain', 'pay_rate' => 0, 'status' => 1]);
    }

    public function test_import_rejects_bad_rows_and_writes_nothing(): void
    {
        $file = UploadedFile::fake()->createWithContent('employees.csv',
            "name,user_type,pay_type\nGood,rider,daily\nBad,pilot,yearly\n");

        $this->post('/api/admin/import/employees', ['file' => $file], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('row_3');

        $this->assertSame(0, Employee::count());
    }

    public function test_sample_file_has_the_employee_columns(): void
    {
        $csv = $this->get('/api/admin/import/employees/sample')->assertOk()->getContent();

        $this->assertStringStartsWith('name,phone,cnic,user_type,user_type_other,pay_type,pay_rate,status', $csv);
    }

    public function test_other_type_needs_its_own_text_and_other_types_clear_it(): void
    {
        $this->postJson('/api/admin/employees', ['name' => 'Kamran', 'user_type' => 'other', 'pay_type' => 'daily'])
            ->assertUnprocessable()->assertJsonValidationErrors('user_type_other');

        $id = $this->postJson('/api/admin/employees', [
            'name' => 'Kamran', 'user_type' => 'other', 'user_type_other' => '  Guard ', 'pay_type' => 'daily',
        ])->assertCreated()->assertJsonPath('user_type_other', 'Guard')->json('id');

        // a text sent with another type is not kept, and switching away from Other clears it
        $this->postJson("/api/admin/employees/$id", [
            'name' => 'Kamran', 'user_type' => 'cook', 'user_type_other' => 'Guard', 'pay_type' => 'daily',
        ])->assertOk()->assertJsonPath('user_type', 'cook')->assertJsonPath('user_type_other', null);
    }

    public function test_import_keeps_the_other_type_text(): void
    {
        $file = UploadedFile::fake()->createWithContent('employees.csv',
            "name,user_type,user_type_other,pay_type\nKamran,other,Guard,daily\nAsad,cook,Ignored,daily\n");

        $this->post('/api/admin/import/employees', ['file' => $file])->assertOk()->assertJson(['created' => 2]);

        $this->assertDatabaseHas('employees', ['name' => 'Kamran', 'user_type' => 'other', 'user_type_other' => 'Guard']);
        $this->assertDatabaseHas('employees', ['name' => 'Asad', 'user_type_other' => null]);
    }

    public function test_role_can_be_granted_employee_permissions(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'HR',
            'permissions' => [['module' => 'employees', 'can_view' => true, 'can_create' => true]],
        ])->assertCreated()->assertJsonPath('permissions.0.module', 'employees');
    }

    public function test_rename_migration_keeps_data_and_moves_role_permissions(): void
    {
        $migration = require base_path('database/migrations/2026_11_19_000003_rename_labours_to_employees.php');

        // back to the old labour names, with data saved under them
        $migration->down();
        $this->assertTrue(Schema::hasColumn('labour_payments', 'labour_id'));
        $this->assertFalse(Schema::hasTable('employees'));
        $labourId = DB::table('labours')->insertGetId(['name' => 'Bilal', 'user_type' => 'cook', 'pay_type' => 'monthly', 'pay_rate' => 30000]);
        DB::table('labour_payments')->insert(['labour_id' => $labourId, 'type' => 'advance', 'payment_date' => '2026-11-18', 'amount' => 500, 'payment_method' => 'cash']);
        $roleId = DB::table('roles')->insertGetId(['name' => 'HR', 'code' => 'hr']);
        DB::table('role_permissions')->insert([
            ['role_id' => $roleId, 'module' => 'labours', 'can_view' => 1, 'can_create' => 1, 'can_edit' => 0, 'can_delete' => 0],
            ['role_id' => $roleId, 'module' => 'labour-payments', 'can_view' => 1, 'can_create' => 0, 'can_edit' => 0, 'can_delete' => 1],
        ]);

        $migration->up();

        $this->assertFalse(Schema::hasTable('labours'));
        $this->assertFalse(Schema::hasTable('labour_payments'));
        $employee = Employee::with('payments')->findOrFail($labourId);
        $this->assertSame('Bilal', $employee->name);
        $this->assertEquals(500, $employee->payments->sole()->amount);

        $perms = DB::table('role_permissions')->where('role_id', $roleId)->get()->keyBy('module');
        $this->assertEqualsCanonicalizing(['employees', 'employee-payments'], $perms->keys()->all());
        $this->assertEquals([1, 1, 0, 0], [$perms['employees']->can_view, $perms['employees']->can_create, $perms['employees']->can_edit, $perms['employees']->can_delete]);
        $this->assertEquals([1, 0, 0, 1], [$perms['employee-payments']->can_view, $perms['employee-payments']->can_create, $perms['employee-payments']->can_edit, $perms['employee-payments']->can_delete]);
    }
}
