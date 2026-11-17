<?php

namespace App\Http\Controllers\Admin;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends ApiCrudController
{
    protected string $model = User::class;
    protected array $search = ['name', 'email'];
    protected array $with = ['role'];

    protected function rules(Request $request, $model = null): array
    {
        return [
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email'.($model ? ','.$model->id : ''),
            'password' => ($model ? 'nullable' : 'required').'|string|min:6',
            'role_id'  => 'required|integer|exists:roles,id',
            'status'   => 'nullable|boolean',
        ];
    }

    protected function fields(array $data): array
    {
        $f = collect($data)->only(['name', 'email', 'role_id'])->toArray();
        if (!empty($data['password'])) {
            $f['password'] = Hash::make($data['password']);
        }
        $f['status'] = $data['status'] ?? true;
        return $f;
    }

    protected function syncRelations($model, array $data): void {}
}
