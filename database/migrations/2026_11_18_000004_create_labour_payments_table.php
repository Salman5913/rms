<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Money paid to employees (labours): salary payments and advances.
 * amount = cash handed over: net_paid (earned - advance_deducted) for a salary, the advance itself for an advance.
 * Outstanding advance of an employee = all advance amounts - all advance_deducted.
 * Reports use payment_date (entered by the user), never created_at.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('labour_payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('labour_id')->constrained('labours')->restrictOnDelete();
            $t->string('type');   // salary, advance
            $t->date('payment_date')->index();
            $t->date('period_from')->nullable();   // salary only
            $t->date('period_to')->nullable();     // salary only
            $t->decimal('units', 8, 2)->nullable();   // months / weeks / days worked behind the suggestion
            $t->decimal('earned', 12, 2)->default(0);
            $t->decimal('advance_deducted', 12, 2)->default(0);
            $t->decimal('amount', 12, 2);   // cash paid
            $t->string('payment_method');   // cash, bank, other
            $t->text('comment')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();

            $t->index(['labour_id', 'payment_date', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('labour_payments');
    }
};
