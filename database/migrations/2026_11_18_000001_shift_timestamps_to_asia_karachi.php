<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The app timezone moved from UTC to Asia/Karachi (UTC+5, no daylight saving).
 * Laravel stores date-times without a timezone, in the app timezone, so every value saved
 * before the switch is UTC and would now be read 5 hours early. This moves all existing
 * datetime / timestamp values forward 5 hours so they become Karachi time.
 * Date-only columns (e.g. daily_closes.business_date) are left unchanged.
 */
return new class extends Migration
{
    private const HOURS = 5;

    public function up(): void
    {
        $this->shift('+');
    }

    public function down(): void
    {
        $this->shift('-');
    }

    private function shift(string $sign): void
    {
        // the stored values only exist in the MySQL database (tests use a fresh in-memory SQLite one)
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        // only this app's database, never other databases on the same server
        foreach (Schema::getTables(DB::getDatabaseName()) as $table) {
            $name = $table['name'];
            $columns = collect(Schema::getColumns($name))
                ->filter(fn ($c) => in_array(strtolower($c['type_name']), ['datetime', 'timestamp'], true))
                ->pluck('name');

            if ($columns->isEmpty()) {
                continue;
            }

            $set = $columns->map(fn ($c) => "`$c` = `$c` {$sign} INTERVAL ".self::HOURS.' HOUR')->implode(', ');
            DB::statement("UPDATE `$name` SET $set");
        }
    }
};
