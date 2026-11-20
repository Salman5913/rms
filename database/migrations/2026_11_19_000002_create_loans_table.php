<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Business loans the restaurant has taken, and the repayments made on them.
 * Remaining and status are calculated (amount - repayments), never stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loans', function (Blueprint $t) {
            $t->id();
            $t->string('lender_name');
            $t->string('lender_phone')->nullable();
            $t->date('loan_date')->index();
            $t->decimal('amount', 12, 2);
            $t->string('reference')->nullable();   // agreement / cheque no.
            $t->text('comment')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('loan_repayments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('loan_id')->constrained('loans')->restrictOnDelete();
            $t->date('repayment_date')->index();
            $t->decimal('amount', 12, 2);
            $t->string('payment_method');   // cash, bank, other
            $t->text('comment')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_repayments');
        Schema::dropIfExists('loans');
    }
};
