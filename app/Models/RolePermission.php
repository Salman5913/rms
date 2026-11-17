<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RolePermission extends Model
{
    protected $fillable = ['role_id', 'module', 'can_create', 'can_edit', 'can_view', 'can_delete'];

    public $timestamps = false;

    protected $casts = ['can_create' => 'boolean', 'can_edit' => 'boolean', 'can_view' => 'boolean', 'can_delete' => 'boolean'];
}
