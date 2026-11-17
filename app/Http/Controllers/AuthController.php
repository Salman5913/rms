<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $data['email'])->where('status', 1)->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        return response()->json([
            'token' => $user->createToken('rms')->plainTextToken,
            'user' => $this->payload($user),
        ]);
    }

    public function me(Request $request)
    {
        return response()->json($this->payload($request->user()));
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    private function payload($user)
    {
        $perms = [];
        foreach ($user->role?->permissions ?? [] as $p) {
            $perms[$p->module] = [
                'create' => (bool) $p->can_create,
                'edit' => (bool) $p->can_edit,
                'view' => (bool) $p->can_view,
                'delete' => (bool) $p->can_delete,
            ];
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role ? ['id' => $user->role->id, 'name' => $user->role->name, 'code' => $user->role->code] : null,
            'permissions' => $perms,
        ];
    }
}
