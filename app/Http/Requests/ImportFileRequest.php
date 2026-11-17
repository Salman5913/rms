<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ImportFileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // extension check rather than mimes: Excel-saved CSVs often report odd MIME types
            'file' => ['required', 'file', 'max:10240', 'extensions:csv,txt,xlsx'],
        ];
    }

    public function messages(): array
    {
        return ['file.extensions' => 'Upload a .csv or .xlsx file.'];
    }
}
