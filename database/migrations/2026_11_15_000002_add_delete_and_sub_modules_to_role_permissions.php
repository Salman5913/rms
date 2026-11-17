<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - adds the `can_delete` permission flag
 * - permissions now live on inner (sub) modules: the old single "orders" module is split
 *   into pickup-orders / website-orders / dinein-orders, keeping each role's existing flags
 */
return new class extends Migration
{
    private array $orderModules = ['pickup-orders', 'website-orders', 'dinein-orders'];

    public function up(): void
    {
        Schema::table('role_permissions', function (Blueprint $t) {
            $t->boolean('can_delete')->default(0)->after('can_view');
        });

        foreach (DB::table('role_permissions')->where('module', 'orders')->get() as $row) {
            foreach ($this->orderModules as $module) {
                DB::table('role_permissions')->insert([
                    'role_id' => $row->role_id, 'module' => $module,
                    'can_create' => $row->can_create, 'can_edit' => $row->can_edit,
                    'can_view' => $row->can_view, 'can_delete' => 0,
                ]);
            }
        }
        DB::table('role_permissions')->where('module', 'orders')->delete();
    }

    public function down(): void
    {
        $rows = DB::table('role_permissions')->whereIn('module', $this->orderModules)->get()->groupBy('role_id');
        foreach ($rows as $roleId => $perms) {
            DB::table('role_permissions')->insert([
                'role_id' => $roleId, 'module' => 'orders',
                'can_create' => $perms->max('can_create'), 'can_edit' => $perms->max('can_edit'),
                'can_view' => $perms->max('can_view'),
            ]);
        }
        DB::table('role_permissions')->whereIn('module', $this->orderModules)->delete();

        Schema::table('role_permissions', function (Blueprint $t) {
            $t->dropColumn('can_delete');
        });
    }
};
