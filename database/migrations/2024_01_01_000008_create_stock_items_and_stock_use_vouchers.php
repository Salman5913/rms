<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('stock_items', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->enum('unit', ['kg', 'number', 'dozen', 'packs', 'mann'])->default('number');
            $t->decimal('value', 12, 2)->default(0);
            $t->timestamps();
        });
        Schema::create('stock_use_vouchers', function (Blueprint $t) {
            $t->id();
            $t->string('voucher_number')->unique();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('stock_use_voucher_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_use_voucher_id')->constrained()->cascadeOnDelete();
            $t->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $t->decimal('value', 12, 2);
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('stock_use_voucher_items');
        Schema::dropIfExists('stock_use_vouchers');
        Schema::dropIfExists('stock_items');
    }
};
