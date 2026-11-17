<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('banners', function (Blueprint $t) {
            $t->id();
            $t->string('image');
            $t->string('title')->nullable();
            $t->string('subtitle')->nullable();
            $t->string('cta_text')->nullable();
            $t->integer('position')->default(0);
            $t->boolean('status')->default(1);
            $t->timestamps();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('banners');
    }
};
