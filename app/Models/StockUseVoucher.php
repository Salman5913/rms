<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class StockUseVoucher extends Model
{
    protected $fillable = ['voucher_number', 'user_id'];
    public function items() { return $this->hasMany(StockUseVoucherItem::class); }
}
