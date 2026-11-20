<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The vendor ledger: one row per purchase (credit, balance goes up) or payment (debit, balance goes down).
 * Reports use transaction_date (entered by the user), never created_at.
 * source = "manual" (entered on the vendor ledger) or "chai" (created by the Chai module).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendor_transactions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('vendor_id')->constrained('vendors')->restrictOnDelete();
            $t->string('type');   // purchase, payment
            $t->date('transaction_date')->index();
            $t->decimal('amount', 12, 2);   // always > 0 (validated); the type decides the sign
            $t->string('reference')->nullable();
            $t->string('payment_method')->nullable();   // cash, bank, other (payments only)
            $t->text('comment')->nullable();
            $t->string('source')->default('manual');
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();

            $t->index(['vendor_id', 'transaction_date', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_transactions');
    }
};
