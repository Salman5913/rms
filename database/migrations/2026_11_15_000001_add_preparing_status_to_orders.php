<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->enum('status', ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
                ->default('RECEIVED')->change();
        });
    }

    public function down(): void
    {
        DB::table('orders')->where('status', 'PREPARING')->update(['status' => 'RECEIVED']);

        Schema::table('orders', function (Blueprint $t) {
            $t->enum('status', ['RECEIVED', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
                ->default('RECEIVED')->change();
        });
    }
};
