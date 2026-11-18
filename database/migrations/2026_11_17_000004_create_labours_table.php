<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** basic labour (staff) register; delivery riders are labours with user_type = rider */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('labours', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('phone')->nullable();
            $t->string('cnic')->nullable();
            $t->string('user_type');   // rider, cook, waiter, cleaner, manager, other
            $t->string('pay_type');    // monthly, weekly, daily
            $t->decimal('pay_rate', 10, 2)->default(0);
            $t->boolean('status')->default(1);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('labours');
    }
};
