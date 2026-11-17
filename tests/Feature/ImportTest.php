<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class ImportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // in-memory sqlite (phpunit.xml); only the tables needed, see OrderUpdateTest
        $this->artisan('migrate', ['--path' => [
            'database/migrations/2024_01_01_000001_create_roles_and_role_permissions.php',
            'database/migrations/2024_01_01_000002_create_users.php',
            'database/migrations/2024_01_01_000003_create_categories_and_products.php',
            'database/migrations/2024_01_01_000004_create_options_and_extras.php',
            'database/migrations/2024_01_01_000005_create_deals.php',
            'database/migrations/2024_01_01_000008_create_stock_items_and_stock_use_vouchers.php',
        ]]);

        Sanctum::actingAs(User::forceCreate([
            'name' => 'Admin', 'email' => 'admin@example.test', 'password' => bcrypt('password'),
        ]));
    }

    private function csv(string $content, string $name = 'import.csv'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $content);
    }

    /** builds a real .xlsx (shared strings + inline string + numbers) */
    private function xlsx(array $rows): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);

        $strings = [];
        $sheetRows = '';
        foreach ($rows as $r => $cells) {
            $sheetRows .= '<row r="'.($r + 1).'">';
            foreach (array_values($cells) as $c => $val) {
                $ref = chr(65 + $c).($r + 1);
                if (is_numeric($val)) {
                    $sheetRows .= "<c r=\"$ref\"><v>$val</v></c>";
                } else {
                    $strings[] = htmlspecialchars($val);
                    $sheetRows .= "<c r=\"$ref\" t=\"s\"><v>".(count($strings) - 1).'</v></c>';
                }
            }
            $sheetRows .= '</row>';
        }

        $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        $zip->addFromString('xl/workbook.xml', "<workbook xmlns=\"$ns\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Data\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
        $zip->addFromString('xl/sharedStrings.xml', "<sst xmlns=\"$ns\">".implode('', array_map(fn ($s) => "<si><t>$s</t></si>", $strings)).'</sst>');
        $zip->addFromString('xl/worksheets/sheet1.xml', "<worksheet xmlns=\"$ns\"><sheetData>$sheetRows</sheetData></worksheet>");
        $zip->close();

        return new UploadedFile($path, 'import.xlsx', null, null, true);
    }

    public function test_it_imports_categories_from_csv(): void
    {
        $file = $this->csv("\xEF\xBB\xBFname,image,status\nBurgers,,1\n\"Pizza, Large\",,no\n");

        $this->post('/api/admin/import/categories', ['file' => $file])
            ->assertOk()->assertJson(['ok' => true, 'imported' => 2]);

        $this->assertDatabaseHas('categories', ['name' => 'Burgers', 'slug' => 'burgers', 'status' => 1]);
        $this->assertDatabaseHas('categories', ['name' => 'Pizza, Large', 'status' => 0]);
    }

    public function test_it_imports_stock_items_from_xlsx(): void
    {
        $file = $this->xlsx([
            ['name', 'unit', 'value'],
            ['Flour', 'kg', 25],
            ['Eggs', 'dozen', 4.5],
        ]);

        $this->post('/api/admin/import/stock-items', ['file' => $file])
            ->assertOk()->assertJson(['imported' => 2]);

        $this->assertSame(['Flour', 'Eggs'], StockItem::orderBy('id')->pluck('name')->all());
        $this->assertEquals(4.5, StockItem::where('name', 'Eggs')->value('value'));
    }

    public function test_it_imports_products_and_syncs_pipe_separated_relations(): void
    {
        $a = Category::create(['name' => 'A', 'slug' => 'a']);
        $b = Category::create(['name' => 'B', 'slug' => 'b']);

        $file = $this->csv("name,description,price,availability,categories,status\nZinger,Crispy,550,both,{$a->id}|{$b->id},1\n");

        $this->post('/api/admin/import/products', ['file' => $file])->assertOk();

        $this->assertEqualsCanonicalizing([$a->id, $b->id], Product::firstOrFail()->categories->pluck('id')->all());
    }

    public function test_it_hashes_user_passwords(): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $file = $this->csv("name,email,password,role_id\nAli,ali@example.com,secret123,{$role->id}\n");

        $this->post('/api/admin/import/users', ['file' => $file])->assertOk();

        $this->assertTrue(Hash::check('secret123', User::where('email', 'ali@example.com')->value('password')));
    }

    public function test_it_rejects_the_whole_file_and_reports_line_numbers_when_a_row_is_invalid(): void
    {
        $file = $this->csv("name,unit,value\nFlour,kg,25\nSugar,tons,10\n");

        $this->postJson('/api/admin/import/stock-items', ['file' => $file])
            ->assertStatus(422)->assertJsonValidationErrors(['row_3']);

        $this->assertSame(0, StockItem::count());
    }

    public function test_it_rejects_duplicate_emails_inside_the_file(): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $file = $this->csv("name,email,password,role_id\nAli,ali@example.com,secret123,{$role->id}\nAli 2,ALI@example.com,secret123,{$role->id}\n");

        $this->postJson('/api/admin/import/users', ['file' => $file])
            ->assertStatus(422)->assertJsonValidationErrors(['row_3']);
    }

    public function test_it_updates_records_whose_name_already_exists_and_creates_the_rest(): void
    {
        StockItem::create(['name' => 'Flour', 'unit' => 'kg', 'value' => 5]);

        $file = $this->csv("name,unit,value\nFlour,kg,30\nSugar,kg,10\n");

        $this->post('/api/admin/import/stock-items', ['file' => $file])
            ->assertOk()->assertJson(['created' => 1, 'updated' => 1, 'imported' => 2]);

        $this->assertSame(2, StockItem::count());
        $this->assertEquals(30, StockItem::where('name', 'Flour')->value('value'));
    }

    public function test_blank_cells_keep_existing_values_and_relations_on_update(): void
    {
        $a = Category::create(['name' => 'A', 'slug' => 'a']);
        $b = Category::create(['name' => 'B', 'slug' => 'b']);
        $p = Product::create(['name' => 'Zinger', 'description' => 'Crispy', 'price' => 500, 'availability' => 'both', 'is_popular' => true, 'status' => 0]);
        $p->categories()->sync([$a->id, $b->id]);

        // only the price changes; description, categories, is_popular and status are blank
        $file = $this->csv("name,description,price,availability,is_popular,categories,status\nZinger,,650,,,,\n");

        $this->post('/api/admin/import/products', ['file' => $file])
            ->assertOk()->assertJson(['created' => 0, 'updated' => 1]);

        $p->refresh();
        $this->assertEquals(650, $p->price);
        $this->assertSame('Crispy', $p->description);
        $this->assertTrue($p->is_popular);
        $this->assertEquals(0, $p->status);
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $p->categories->pluck('id')->all());
    }

    public function test_updating_a_user_keeps_the_password_when_blank_and_allows_the_same_email(): void
    {
        $role = Role::create(['name' => 'Cashier', 'code' => 'cashier']);
        $user = User::forceCreate(['name' => 'Ali', 'email' => 'ali@example.com', 'password' => Hash::make('original1'), 'role_id' => $role->id]);

        $file = $this->csv("name,email,password,role_id\nAli,ali@example.com,,{$role->id}\n");

        $this->post('/api/admin/import/users', ['file' => $file])->assertOk()->assertJson(['updated' => 1]);

        $this->assertTrue(Hash::check('original1', $user->fresh()->password));
    }

    public function test_it_rejects_a_name_repeated_inside_the_file(): void
    {
        $file = $this->csv("name,unit,value\nFlour,kg,5\nflour,kg,6\n");

        $this->postJson('/api/admin/import/stock-items', ['file' => $file])
            ->assertStatus(422)->assertJsonValidationErrors(['row_3']);
    }

    public function test_it_rejects_unsupported_file_types(): void
    {
        $this->postJson('/api/admin/import/categories', ['file' => UploadedFile::fake()->create('data.pdf', 10)])
            ->assertStatus(422)->assertJsonValidationErrors(['file']);
    }

    public function test_it_serves_a_sample_file_with_the_expected_headers(): void
    {
        $res = $this->get('/api/admin/import/stock-items/sample')->assertOk();

        $this->assertStringStartsWith("name,unit,value\n", $res->getContent());
        $this->get('/api/admin/import/nope/sample')->assertNotFound();
    }
}
