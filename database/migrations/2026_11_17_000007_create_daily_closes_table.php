<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Day close: a snapshot of the day's figures at close time. A date can be closed, reopened and
 * closed again, so there can be several rows per date, but only one with status = closed
 * (enforced in DailyCloseService).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_closes', function (Blueprint $t) {
            $t->id();
            $t->date('business_date')->index();
            $t->string('status');   // closed, reopened
            $t->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->dateTime('closed_at');
            $t->json('summary');
            $t->decimal('cash_counted', 12, 2)->nullable();
            $t->text('notes')->nullable();
            $t->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete();
            $t->dateTime('reopened_at')->nullable();
            $t->text('reopen_reason')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_closes');
    }
};
