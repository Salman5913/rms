<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class StockUseVoucherItem extends Model
{
    protected $fillable = ['stock_use_voucher_id', 'stock_item_id', 'value'];
    public $timestamps = false;
    public function stockItem(){
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }
}
