<?php

namespace App\Http\Controllers;

use App\Models\Banner;
use App\Models\Category;
use App\Models\Deal;
use App\Models\Product;

class HomeController extends Controller
{
    /** Everything the Next.js homepage needs, in one call. */
    public function home()
    {
        $with = ['products' => fn ($q) => $q->where('status', 1)->orderBy('id'),
                 'products.options', 'products.extras'];

        return response()->json([
            'banners'  => Banner::where('status', 1)->orderBy('position')->get(['id', 'image', 'title', 'subtitle', 'cta_text']),
            'popular'  => Product::where('status', 1)->where('is_popular', 1)
                ->whereIn('availability', ['website', 'both'])
                ->with(['options', 'extras'])->get(),
            'deals'    => Deal::where('status', 1)->with(['products', 'options', 'extras'])->get(),
            'categories' => Category::where('status', 1)->orderBy('position')->with($with)->get(),
        ]);
    }
}
