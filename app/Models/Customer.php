<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** one customer per phone number; first-time customers are saved from home delivery and website orders */
class Customer extends Model
{
    protected $fillable = ['name', 'phone', 'address', 'delivery_area_id'];

    protected $casts = ['delivery_area_id' => 'integer'];

    public function deliveryArea(): BelongsTo
    {
        return $this->belongsTo(DeliveryArea::class);
    }

    /** "0300-123 4567" and "03001234567" are the same customer: keep only digits and a leading + */
    public static function normalizePhone(?string $phone): string
    {
        return preg_replace('/[^\d+]/', '', (string) $phone);
    }

    /**
     * Saves the customer of a new order if this phone number is not known yet.
     * An existing customer is left unchanged (their details are edited on the Customers page).
     */
    public static function rememberFromOrder(?string $name, ?string $phone, ?string $address, ?int $areaId = null): void
    {
        $phone = self::normalizePhone($phone);
        if ($phone === '' || ! $name) {
            return;
        }

        self::firstOrCreate(['phone' => $phone], [
            'name' => $name,
            'address' => $address,
            'delivery_area_id' => $areaId,
        ]);
    }
}
