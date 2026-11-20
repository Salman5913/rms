<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extra (running) expenses of the restaurant, grouped by category.
 * They are subtracted in the Profit & Loss report (ExpenseService::totalForRange()).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expense_categories', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->boolean('status')->default(true);
            $t->timestamps();
        });

        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            // restrict: a category with expenses can't be deleted (deactivate it instead)
            $t->foreignId('expense_category_id')->constrained('expense_categories')->restrictOnDelete();
            $t->date('expense_date')->index();
            $t->decimal('amount', 12, 2);
            $t->string('payment_method');   // cash, bank, other
            $t->string('paid_to')->nullable();   // who received the money
            $t->string('reference')->nullable();   // bill / receipt no.
            $t->text('comment')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();

            // report: per-category totals for a date range
            $t->index(['expense_category_id', 'expense_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('expense_categories');
    }
};
