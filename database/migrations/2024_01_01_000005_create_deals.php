<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('deals', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->text('description');
            $t->decimal('price', 10, 2);
            $t->string('image')->nullable();
            $t->string('badge')->nullable();
            $t->string('options_title')->nullable();
            $t->string('extras_title')->nullable();
            $t->boolean('status')->default(1);
            $t->timestamps();
        });
        Schema::create('deal_product', function (Blueprint $t) {
            $t->foreignId('deal_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->constrained()->cascadeOnDelete();
            $t->primary(['deal_id', 'product_id']);
        });
        Schema::create('deal_option', function (Blueprint $t) {
            $t->foreignId('deal_id')->constrained()->cascadeOnDelete();
            $t->foreignId('option_id')->constrained()->cascadeOnDelete();
            $t->primary(['deal_id', 'option_id']);
        });
        Schema::create('deal_extra', function (Blueprint $t) {
            $t->foreignId('deal_id')->constrained()->cascadeOnDelete();
            $t->foreignId('extra_id')->constrained()->cascadeOnDelete();
            $t->primary(['deal_id', 'extra_id']);
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('deal_extra');
        Schema::dropIfExists('deal_option');
        Schema::dropIfExists('deal_product');
        Schema::dropIfExists('deals');
    }
};
