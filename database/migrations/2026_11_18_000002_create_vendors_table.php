<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vendors (suppliers). opening_balance = what we already owed the vendor when we started using the
 * system (negative = we had paid in advance). The ledger itself lives in vendor_transactions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendors', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('phone')->nullable();
            $t->string('company')->nullable();
            $t->string('address')->nullable();
            $t->decimal('opening_balance', 12, 2)->default(0);
            $t->boolean('status')->default(true);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendors');
    }
};
