<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The employee's own type text when user_type = "other" (e.g. "Helper", "Guard").
 * user_type itself stays "other", so type filters and rider logic keep working.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('labours', function (Blueprint $t) {
            $t->string('user_type_other', 100)->nullable()->after('user_type');
        });
    }

    public function down(): void
    {
        Schema::table('labours', function (Blueprint $t) {
            $t->dropColumn('user_type_other');
        });
    }
};
