<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

/** a day-close rule was broken; renders as 422 { message, ...extra } */
class DailyCloseException extends Exception
{
    public function __construct(string $message, private array $extra = [])
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()] + $this->extra, 422);
    }
}
