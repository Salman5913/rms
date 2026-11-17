<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Deal extends Model
{
    protected $fillable = [
        'name', 'description', 'price', 'image', 'badge',
        'options_title', 'extras_title', 'status',
    ];
    public function products() { return $this->belongsToMany(Product::class, 'deal_product'); }
    public function options() { return $this->belongsToMany(Option::class, 'deal_option'); }
    public function extras() { return $this->belongsToMany(Extra::class, 'deal_extra'); }
}
