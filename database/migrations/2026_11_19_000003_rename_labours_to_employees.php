<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Labour module is now Employees, and Payroll's labour names follow:
 * - tables labours -> employees, labour_payments -> employee_payments
 * - column employee_payments.labour_id -> employee_id (its foreign key and indexes renamed with it)
 * - permission modules labours -> employees, labour-payments -> employee-payments, keeping each role's flags
 * orders.rider_id (a plain column, no foreign key) keeps pointing at the same ids.
 */
return new class extends Migration
{
    private const MODULES = ['labours' => 'employees', 'labour-payments' => 'employee-payments'];

    public function up(): void
    {
        $this->rename('labour', 'employee', array_keys(self::MODULES), array_values(self::MODULES));
    }

    public function down(): void
    {
        $this->rename('employee', 'labour', array_values(self::MODULES), array_keys(self::MODULES));
    }

    private function rename(string $from, string $to, array $oldModules, array $newModules): void
    {
        $mysql = in_array(DB::getDriverName(), ['mysql', 'mariadb'], true);
        $payments = "{$from}_payments";

        // each test migrates only the tables it needs, so every step checks its table is there
        if (Schema::hasTable($payments)) {
            if ($mysql) {
                // re-created below under the new names (sqlite keeps the reference through the renames)
                Schema::table($payments, fn (Blueprint $t) => $t->dropForeign("{$payments}_{$from}_id_foreign"));
            }
            Schema::rename($payments, "{$to}_payments");
            Schema::table("{$to}_payments", fn (Blueprint $t) => $t->renameColumn("{$from}_id", "{$to}_id"));

            foreach (Schema::getIndexes("{$to}_payments") as $index) {
                if (str_contains($index['name'], $from)) {
                    $new = str_replace(["{$from}_payments", "{$from}_id"], ["{$to}_payments", "{$to}_id"], $index['name']);
                    Schema::table("{$to}_payments", fn (Blueprint $t) => $t->renameIndex($index['name'], $new));
                }
            }
        }

        if (Schema::hasTable("{$from}s")) {
            Schema::rename("{$from}s", "{$to}s");
        }

        if ($mysql && Schema::hasTable("{$to}_payments")) {
            Schema::table("{$to}_payments", fn (Blueprint $t) => $t->foreign("{$to}_id")->references('id')->on("{$to}s")->restrictOnDelete());
        }

        if (Schema::hasTable('role_permissions')) {
            foreach ($oldModules as $i => $module) {
                DB::table('role_permissions')->where('module', $module)->update(['module' => $newModules[$i]]);
            }
        }
    }
};
