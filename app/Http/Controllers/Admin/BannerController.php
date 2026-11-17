<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Banner;
use Illuminate\Http\Request;

class BannerController extends Controller
{
    /** Single-page create+update: returns ordered images */
    public function index()
    {
        return response()->json(Banner::orderBy('position')->get());
    }

    /** Replaces the whole set with the ordered array (create + update in one). */
    public function update(Request $request)
    {
        $data = $request->validate([
            'images'              => 'required|array|min:1',
            'images.*.id'         => 'nullable|integer',
            'images.*.image'      => 'required|string',
            'images.*.title'      => 'nullable|string',
            'images.*.subtitle'   => 'nullable|string',
            'images.*.cta_text'   => 'nullable|string',
        ]);

        $keep = collect($data['images'])->pluck('id')->filter();

        Banner::whereNotIn('id', $keep)->delete();

        foreach ($data['images'] as $pos => $img) {
            Banner::updateOrCreate(
                ['id' => $img['id'] ?? 0],
                [
                    'image' => $img['image'],
                    'title' => $img['title'] ?? null,
                    'subtitle' => $img['subtitle'] ?? null,
                    'cta_text' => $img['cta_text'] ?? null,
                    'position' => $pos + 1,
                    'status' => 1,
                ]
            );
        }

        return response()->json(Banner::orderBy('position')->get());
    }
}
