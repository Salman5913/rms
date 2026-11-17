<?php

use Illuminate\Support\Facades\Route;

// React SPA — every route renders the RMS app
Route::view('/{any?}', 'app')->where('any', '.*');
