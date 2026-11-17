<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class OrderItem extends Model
{
    protected $fillable = ['order_id', 'product_id', 'deal_id', 'name', 'unit_price', 'qty', 'modifiers'];
    protected $casts = ['modifiers' => 'array'];
    public function order() { return $this->belongsTo(Order::class); }
}
