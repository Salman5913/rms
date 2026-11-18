<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class DailyClose extends Model
{
    public const STATUS_CLOSED = 'closed';

    public const STATUS_REOPENED = 'reopened';

    public const STATUSES = [self::STATUS_CLOSED, self::STATUS_REOPENED];

    protected $fillable = [
        'business_date', 'status', 'closed_by', 'closed_at', 'summary', 'cash_counted', 'notes',
        'reopened_by', 'reopened_at', 'reopen_reason',
    ];

    protected $casts = [
        'business_date' => 'date:Y-m-d',
        'closed_at' => 'datetime',
        'reopened_at' => 'datetime',
        'summary' => 'array',
        'cash_counted' => 'decimal:2',
    ];

    public function closedBy()
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function reopenedBy()
    {
        return $this->belongsTo(User::class, 'reopened_by');
    }

    /** the active (status = closed) close rows */
    public function scopeActive(Builder $q): Builder
    {
        return $q->where('status', self::STATUS_CLOSED);
    }

    public function scopeForDate(Builder $q, string $date): Builder
    {
        return $q->whereDate('business_date', $date);
    }
}
