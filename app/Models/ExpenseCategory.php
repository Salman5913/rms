<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** inactive categories are hidden from the "new expense" dropdown but still shown in reports */
class ExpenseCategory extends Model
{
    protected $fillable = ['name', 'status'];

    protected $casts = [
        'status' => 'boolean',
        // only present on the category list (ExpenseCategoryController::filter())
        'entries' => 'integer',
        'amount' => 'float',
        'percent' => 'float',
    ];

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }
}
