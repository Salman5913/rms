<?php
use Illuminate\Support\Facades\Artisan;
Artisan::command('inspire', function () {
    $this->comment('Restaurant RMS');
})->purpose('Display an inspiring quote');
