<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class UploadController extends Controller
{
    public function store(Request $request)
    {
        $request->validate(['file' => 'required|image|max:4096']);
        $path = $request->file('file')->store('uploads', 'public');
        return response()->json(['url' => asset('storage/'.$path)]);
    }
}
