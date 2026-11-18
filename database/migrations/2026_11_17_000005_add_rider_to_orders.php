<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** home delivery orders: the assigned rider (a labour) and the rider's name kept as a snapshot */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->unsignedBigInteger('rider_id')->nullable()->after('delivery_charges');
            $t->string('rider_name')->nullable()->after('rider_id');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->dropColumn(['rider_id', 'rider_name']);
        });
    }
};
