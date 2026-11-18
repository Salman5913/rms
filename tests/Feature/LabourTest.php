<?php

namespace Tests\Feature;

use App\Models\Labour;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LabourTest extends TestCase
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
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    public function test_crud(): void
    {
        $id = $this->postJson('/api/admin/labours', [
            'name' => 'Bilal', 'phone' => '03111111111', 'cnic' => '35202-1234567-1',
            'user_type' => 'rider', 'pay_type' => 'monthly', 'pay_rate' => 30000,
        ])->assertCreated()
            ->assertJsonPath('status', true)
            ->assertJsonPath('user_type', 'rider')
            ->json('id');

        $this->getJson('/api/admin/labours?search=bil')->assertOk()->assertJsonPath('data.0.name', 'Bilal');
        $this->getJson("/api/admin/labours/$id")->assertOk()->assertJsonPath('cnic', '35202-1234567-1');

        $this->postJson("/api/admin/labours/$id", [
            'name' => 'Bilal Khan', 'user_type' => 'cook', 'pay_type' => 'daily', 'pay_rate' => 1500, 'status' => false,
        ])->assertOk()
            ->assertJsonPath('name', 'Bilal Khan')
            ->assertJsonPath('pay_type', 'daily')
            ->assertJsonPath('status', false);

        $this->deleteJson("/api/admin/labours/$id")->assertOk();
        $this->assertSame(0, Labour::count());
    }

    public function test_pay_rate_defaults_to_zero(): void
    {
        $this->postJson('/api/admin/labours', ['name' => 'Asad', 'user_type' => 'waiter', 'pay_type' => 'weekly'])
            ->assertCreated();

        $this->assertEquals(0, Labour::first()->pay_rate);
    }

    public function test_validation(): void
    {
        $this->postJson('/api/admin/labours', ['user_type' => 'pilot', 'pay_type' => 'yearly', 'pay_rate' => -5])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'user_type', 'pay_type', 'pay_rate']);
    }

    public function test_list_can_be_filtered_by_user_type(): void
    {
        Labour::create(['name' => 'Rider One', 'user_type' => 'rider', 'pay_type' => 'daily']);
        Labour::create(['name' => 'Cook One', 'user_type' => 'cook', 'pay_type' => 'monthly']);

        $this->getJson('/api/admin/labours?user_type=cook')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Cook One');
        $this->getJson('/api/admin/labours')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_it_imports_labours_from_csv_and_updates_by_name(): void
    {
        Labour::create(['name' => 'Bilal', 'phone' => '0300', 'user_type' => 'rider', 'pay_type' => 'monthly', 'pay_rate' => 25000]);

        $file = UploadedFile::fake()->createWithContent('labours.csv',
            "name,phone,cnic,user_type,pay_type,pay_rate,status\n".
            "Bilal,,,rider,monthly,30000,1\n".
            "Asad,03111111111,35202-1,cook,daily,1500,no\n".
            "Zain,,,waiter,weekly,,\n");

        $this->post('/api/admin/import/labours', ['file' => $file])
            ->assertOk()->assertJson(['ok' => true, 'created' => 2, 'updated' => 1]);

        // existing record updated; blank phone kept
        $bilal = Labour::where('name', 'Bilal')->first();
        $this->assertEquals(30000, $bilal->pay_rate);
        $this->assertSame('0300', $bilal->phone);

        $this->assertDatabaseHas('labours', ['name' => 'Asad', 'user_type' => 'cook', 'pay_type' => 'daily', 'status' => 0]);
        $this->assertDatabaseHas('labours', ['name' => 'Zain', 'pay_rate' => 0, 'status' => 1]);
    }

    public function test_import_rejects_bad_rows_and_writes_nothing(): void
    {
        $file = UploadedFile::fake()->createWithContent('labours.csv',
            "name,user_type,pay_type\nGood,rider,daily\nBad,pilot,yearly\n");

        $this->post('/api/admin/import/labours', ['file' => $file], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('row_3');

        $this->assertSame(0, Labour::count());
    }

    public function test_sample_file_has_the_labour_columns(): void
    {
        $csv = $this->get('/api/admin/import/labours/sample')->assertOk()->getContent();

        $this->assertStringStartsWith('name,phone,cnic,user_type,pay_type,pay_rate,status', $csv);
    }

    public function test_role_can_be_granted_labour_permissions(): void
    {
        $this->postJson('/api/admin/roles', [
            'name' => 'HR',
            'permissions' => [['module' => 'labours', 'can_view' => true, 'can_create' => true]],
        ])->assertCreated()->assertJsonPath('permissions.0.module', 'labours');
    }
}
