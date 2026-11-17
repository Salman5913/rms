<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->unique();
            $t->string('password');
            $t->foreignId('role_id')->nullable()->constrained()->nullOnDelete();
            $t->boolean('status')->default(1);
            $t->rememberToken();
            $t->timestamps();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
