<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('categories', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('slug')->unique();
            $t->string('image')->nullable();
            $t->boolean('status')->default(1);
            $t->integer('position')->default(0);
            $t->timestamps();
        });
        Schema::create('products', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->text('description');
            $t->decimal('price', 10, 2);
            $t->string('image')->nullable();
            $t->string('badge')->nullable();
            $t->boolean('is_popular')->default(0);
            $t->enum('availability', ['website', 'pickup', 'both', 'unavailable'])->default('both');
            $t->string('options_title')->nullable();
            $t->string('extras_title')->nullable();
            $t->boolean('status')->default(1);
            $t->timestamps();
        });
        Schema::create('product_category', function (Blueprint $t) {
            $t->foreignId('product_id')->constrained()->cascadeOnDelete();
            $t->foreignId('category_id')->constrained()->cascadeOnDelete();
            $t->primary(['product_id', 'category_id']);
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('product_category');
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
    }
};
