<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Product extends Model
{
    protected $fillable = [
        'name', 'description', 'price', 'image', 'badge', 'is_popular',
        'availability', 'options_title', 'extras_title', 'status',
    ];
    protected $casts = ['is_popular' => 'boolean'];
    public function categories() { return $this->belongsToMany(Category::class, 'product_category'); }
    public function options() { return $this->belongsToMany(Option::class, 'product_option'); }
    public function extras() { return $this->belongsToMany(Extra::class, 'product_extra'); }
}
