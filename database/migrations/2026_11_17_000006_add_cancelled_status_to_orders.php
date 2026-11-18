<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** website and home delivery orders can be cancelled */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->enum('status', ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])
                ->default('RECEIVED')->change();
        });
    }

    public function down(): void
    {
        // the old column has no CANCELLED value; those orders go back to RECEIVED
        DB::table('orders')->where('status', 'CANCELLED')->update(['status' => 'RECEIVED']);

        Schema::table('orders', function (Blueprint $t) {
            $t->enum('status', ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
                ->default('RECEIVED')->change();
        });
    }
};
