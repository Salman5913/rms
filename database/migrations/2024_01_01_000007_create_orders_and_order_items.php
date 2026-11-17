<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('orders', function (Blueprint $t) {
            $t->id();
            $t->string('order_number')->unique();
            $t->enum('type', ['website', 'pickup']);
            $t->string('customer_name');
            $t->string('customer_phone')->nullable();
            $t->text('address')->nullable();
            $t->text('notes')->nullable();
            $t->enum('status', ['RECEIVED', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])->default('RECEIVED');
            $t->decimal('total', 12, 2)->default(0);
            $t->boolean('is_viewed')->default(0);
            $t->timestamps();
        });
        Schema::create('order_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('order_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->nullable();
            $t->foreignId('deal_id')->nullable();
            $t->string('name');
            $t->decimal('unit_price', 10, 2);
            $t->integer('qty');
            $t->json('modifiers')->nullable();
            $t->timestamps();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
