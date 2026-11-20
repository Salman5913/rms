<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customers, one per phone number. A first-time customer is saved automatically when a home delivery
 * or website order is placed; the order create page fills in name / address / area from the phone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            // stored without spaces or dashes (Customer::normalizePhone); unique = the phone lookup uses this index
            $t->string('phone', 50)->unique();
            $t->text('address')->nullable();
            // last known delivery area (no foreign key, same as orders.delivery_area_id)
            $t->unsignedBigInteger('delivery_area_id')->nullable()->index();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
