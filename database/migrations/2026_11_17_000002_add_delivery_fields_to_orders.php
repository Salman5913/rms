<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** home delivery orders: the chosen area (name kept as a snapshot) and its charges at order time */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->unsignedBigInteger('delivery_area_id')->nullable()->after('notes');
            $t->string('delivery_area')->nullable()->after('delivery_area_id');
            $t->decimal('delivery_charges', 10, 2)->default(0)->after('delivery_area');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->dropColumn(['delivery_area_id', 'delivery_area', 'delivery_charges']);
        });
    }
};
