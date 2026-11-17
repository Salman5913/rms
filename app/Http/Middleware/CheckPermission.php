<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CheckPermission
{
    /**
     * Usage: ->middleware('permission:products,edit')
     * Administrator role bypasses everything.
     */
    public function handle(Request $request, Closure $next, string $module, string $action)
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        if ($user->role && $user->role->code === 'administrator') {
            return $next($request);
        }

        $perm = $user->role?->permissions()->where('module', $module)->first();

        $allowed = match ($action) {
            'create' => $perm?->can_create,
            'edit' => $perm?->can_edit,
            'delete' => $perm?->can_delete,
            default => $perm?->can_view,
        };

        if (! $allowed) {
            return response()->json(['message' => 'Forbidden: missing '.$module.'.'.$action.' permission'], 403);
        }

        return $next($request);
    }
}
