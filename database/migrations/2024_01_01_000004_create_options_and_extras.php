<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('options', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->decimal('price', 10, 2)->default(0);
            $t->boolean('status')->default(1);
            $t->timestamps();
        });
        Schema::create('extras', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->decimal('price', 10, 2)->default(0);
            $t->boolean('status')->default(1);
            $t->timestamps();
        });
        Schema::create('product_option', function (Blueprint $t) {
            $t->foreignId('product_id')->constrained()->cascadeOnDelete();
            $t->foreignId('option_id')->constrained()->cascadeOnDelete();
            $t->primary(['product_id', 'option_id']);
        });
        Schema::create('product_extra', function (Blueprint $t) {
            $t->foreignId('product_id')->constrained()->cascadeOnDelete();
            $t->foreignId('extra_id')->constrained()->cascadeOnDelete();
            $t->primary(['product_id', 'extra_id']);
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('product_extra');
        Schema::dropIfExists('product_option');
        Schema::dropIfExists('extras');
        Schema::dropIfExists('options');
    }
};
