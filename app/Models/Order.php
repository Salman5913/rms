<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = [
        'order_number', 'type', 'customer_name', 'customer_phone',
        'address', 'notes', 'status', 'total', 'is_viewed',
        'delivery_area_id', 'delivery_area', 'delivery_charges',
    ];

    protected $casts = ['is_viewed' => 'boolean'];

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }
}
