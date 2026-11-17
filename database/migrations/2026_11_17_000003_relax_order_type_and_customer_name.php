<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The original migration made `type` an enum of website|pickup and `customer_name` required,
 * but admin orders are also dinein|delivery and have no customer name. Brings fresh installs
 * in line with what the app (and the live database) already uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $t) {
            $t->string('type')->change();
            $t->string('customer_name')->nullable()->change();
        });
    }

    public function down(): void
    {
        // not reversible: rows of type dinein/delivery or without a customer name would not fit the old columns
    }
};
