<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class Labour extends Model
{
    public const USER_TYPES = ['rider', 'cook', 'waiter', 'cleaner', 'manager', 'other'];

    public const PAY_TYPES = ['monthly', 'weekly', 'daily'];

    protected $fillable = ['name', 'phone', 'cnic', 'user_type', 'pay_type', 'pay_rate', 'status'];

    protected $casts = ['status' => 'boolean'];

    /** active labours of type rider (the ones delivery orders can be assigned to) */
    public function scopeActiveRiders(Builder $q): Builder
    {
        return $q->where('user_type', 'rider')->where('status', true);
    }

    /** validation rule: the id belongs to an active rider */
    public static function activeRiderRule(): Exists
    {
        return Rule::exists('labours', 'id')->where('user_type', 'rider')->where('status', true);
    }
}
