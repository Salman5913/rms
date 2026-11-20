<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\FiltersByDateRange;
use App\Http\Controllers\Controller;
use App\Http\Requests\AssignRiderRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Requests\UpdateOrderRequest;
use App\Http\Requests\UpdateOrderStatusRequest;
use App\Models\Customer;
use App\Models\DeliveryArea;
use App\Models\Employee;
use App\Models\Order;
use App\Services\DailyCloseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    use FiltersByDateRange;

    /** every order status (same list as UpdateOrderStatusRequest); used by the list's ?status= filter */
    private const STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

    private const CSV_MAP = ['RECEIVED' => 'PLACED', 'PREPARING' => 'PREPARING', 'READY' => 'PREPARING',
        'OUT_FOR_DELIVERY' => 'ON_THE_WAY', 'DELIVERED' => 'DELIVERED', 'CANCELLED' => 'CANCELLED'];

    /** home delivery orders only move through these (or get cancelled) */
    private const DELIVERY_STATUSES = ['RECEIVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

    /** order types that are delivered to the customer: they carry customer details and a rider */
    private const RIDER_TYPES = ['delivery', 'website'];

    public function __construct(private DailyCloseService $dailyClose) {}

    public function index(Request $request)
    {
        $q = Order::with('items')->where('type', $request->query('type', 'website'));

        if ($s = $request->query('search')) {
            $q->where(fn ($qq) => $qq->where('order_number', 'like', "%{$s}%")
                ->orWhere('customer_name', 'like', "%{$s}%")
                ->orWhere('customer_phone', 'like', "%{$s}%")
                ->when($request->query('type') === 'delivery', fn ($d) => $d->orWhere('address', 'like', "%{$s}%")));
        }

        // ?from / ?to (created date, both inclusive) narrow both the list and the CSV export
        $this->applyDateRange($q, $request);

        // ?status=DELIVERED and ?rider_id=<id> | none (unassigned) column filters, list and export alike
        $f = $request->validate([
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'rider_id' => ['nullable', 'regex:/^(none|\d+)$/'],
        ]);
        if (! empty($f['status'])) {
            $q->where('status', $f['status']);
        }
        if (! empty($f['rider_id'])) {
            $f['rider_id'] === 'none' ? $q->whereNull('rider_id') : $q->where('rider_id', (int) $f['rider_id']);
        }

        if ($request->query('export') === 'csv') {
            $rows = $q->orderByDesc('id')->get();
            $type = $request->query('type', 'website');

            return response()->streamDownload(function () use ($rows, $type) {
                $out = fopen('php://output', 'w');
                fputcsv($out, array_keys($this->exportRow($type, new Order)));
                foreach ($rows as $r) {
                    fputcsv($out, array_values($this->exportRow($type, $r)));
                }
                fclose($out);
            }, $this->exportFileName(ucfirst($type).'-Orders', $request), ['Content-Type' => 'text/csv']);
        }

        return response()->json($q->orderByDesc('id')->paginate(15));
    }

    public function show($id)
    {
        return response()->json(Order::with('items')->findOrFail($id));
    }

    public function store(StoreOrderRequest $request)
    {
        // no new admin orders while today is closed (public website orders are not blocked)
        $this->dailyClose->ensureTodayOpen();

        $data = $request->validated();
        $delivery = $data['type'] === 'delivery';

        // charges come from the area record, never from the client
        $area = $delivery ? DeliveryArea::find($data['delivery_area_id']) : null;
        // rider name is a snapshot from the server record, like the area name
        $rider = ($delivery && ! empty($data['rider_id'])) ? Employee::find($data['rider_id']) : null;

        $order = DB::transaction(function () use ($data, $area, $rider, $delivery) {
            // total is the order amount only; delivery charges are kept separately
            $total = collect($data['items'])->sum(fn ($i) => $i['unit_price'] * $i['qty']);
            $order = Order::create([
                'delivery_area_id' => $area?->id,
                'delivery_area' => $area?->name,
                'delivery_charges' => $area->delivery_charges ?? 0,
                'order_number' => '',
                'type' => $data['type'] ?? 'pickup',
                'customer_name' => $delivery ? $data['customer_name'] : null,
                'customer_phone' => $data['customer_phone'] ?? null,
                'address' => $delivery ? $data['address'] : null,
                'rider_id' => $rider?->id,
                'rider_name' => $rider?->name,
                'status' => 'RECEIVED',
                'total' => $total,
            ]);
            $order->update(['order_number' => 'ON-'.$order->id]);
            foreach ($data['items'] as $i) {
                $order->items()->create($i + ['product_id' => $i['product_id'] ?? null, 'deal_id' => $i['deal_id'] ?? null]);
            }
            // a first-time home delivery customer is saved for the phone lookup on the next order
            if ($delivery) {
                Customer::rememberFromOrder($data['customer_name'], $data['customer_phone'], $data['address'], $area?->id);
            }

            return $order;
        });

        return response()->json($order->load('items'), 201);
    }

    public function update(UpdateOrderRequest $request, $id)
    {
        $order = Order::findOrFail($id);
        $this->dailyClose->ensureUnlocked($order);

        // website orders can only be edited while they are still RECEIVED
        if ($order->type === 'website' && $order->status !== 'RECEIVED') {
            return response()->json(['message' => 'This order can no longer be edited.'], 422);
        }

        $data = $request->validated();

        // delivery and website orders: customer details and rider are editable along with the items
        $extra = [];
        if ($this->hasRider($order)) {
            $extra = collect($data)->only(['customer_name', 'customer_phone', 'address'])->all();
            if (array_key_exists('rider_id', $data)) {
                if ($error = $this->riderChangeError($order, $data['rider_id'])) {
                    return response()->json(['message' => $error], 422);
                }
                $extra += $this->riderFields($data['rider_id']);
            }
            if (array_key_exists('delivery_area_id', $data)) {
                if (! $data['delivery_area_id'] && $order->type === 'delivery') {
                    return response()->json(['message' => 'Home delivery orders need a delivery area.'], 422);
                }
                $extra += $this->areaFields($order, $data['delivery_area_id']);
            }
        }

        DB::transaction(function () use ($order, $data, $extra) {
            // total is the order amount only; delivery charges are kept separately
            $total = collect($data['items'])->sum(fn ($i) => $i['unit_price'] * $i['qty']);
            $order->update(['total' => $total] + $extra);
            $order->items()->delete();
            foreach ($data['items'] as $i) {
                $order->items()->create($i + ['product_id' => $i['product_id'] ?? null, 'deal_id' => $i['deal_id'] ?? null]);
            }
        });

        return response()->json($order->load('items'));
    }

    public function updateStatus(UpdateOrderStatusRequest $request, $id)
    {
        $status = $request->validated()['status'];
        $order = Order::findOrFail($id);
        $this->dailyClose->ensureUnlocked($order);

        // home delivery: RECEIVED -> OUT_FOR_DELIVERY -> DELIVERED
        if ($order->type === 'delivery' && ! in_array($status, self::DELIVERY_STATUSES, true)) {
            return response()->json(['message' => 'Home delivery orders can only be Received, Out for delivery, Delivered or Cancelled.'], 422);
        }
        // only orders delivered to a customer (website, home delivery) can be cancelled
        if ($status === 'CANCELLED' && ! $this->hasRider($order)) {
            return response()->json(['message' => 'Only website and home delivery orders can be cancelled.'], 422);
        }
        // delivery and website orders can't go out without a rider
        if ($status === 'OUT_FOR_DELIVERY' && $this->hasRider($order) && ! $order->rider_id) {
            return response()->json(['message' => 'Assign a rider before marking this order Out for delivery.'], 422);
        }

        $order->update(['status' => $status]);

        return response()->json($order);
    }

    /** change (or clear) the rider of a delivery order without touching its items */
    public function assignRider(AssignRiderRequest $request, $id)
    {
        $order = Order::findOrFail($id);
        $this->dailyClose->ensureUnlocked($order);
        if (! $this->hasRider($order)) {
            return response()->json(['message' => 'Riders can only be assigned to home delivery and website orders.'], 422);
        }

        $riderId = $request->validated()['rider_id'];
        if ($error = $this->riderChangeError($order, $riderId)) {
            return response()->json(['message' => $error], 422);
        }
        $order->update($this->riderFields($riderId));

        return response()->json($order->load('items'));
    }

    public function markViewed($id)
    {
        $order = Order::findOrFail($id);
        $order->update(['is_viewed' => 1]);

        return response()->json(['ok' => true]);
    }

    public function destroy($id)
    {
        $order = Order::findOrFail($id);
        $this->dailyClose->ensureUnlocked($order);
        $order->delete();

        return response()->json(['ok' => true]);
    }

    public function bulkDelete(Request $request)
    {
        $ids = $request->validate(['ids' => 'required|array'])['ids'];
        // all or nothing: one locked order refuses the whole delete
        $this->dailyClose->ensureUnlocked(Order::whereIn('id', $ids)->get());
        Order::whereIn('id', $ids)->delete();

        return response()->json(['ok' => true]);
    }

    /** one CSV row per order (column => value); the keys are the header row */
    private function exportRow(string $type, Order $r): array
    {
        $items = $this->itemsText($r);
        $status = self::CSV_MAP[$r->status] ?? $r->status;

        return match ($type) {
            // walk-in orders: no customer details or status
            'pickup', 'dinein' => [
                'order_number' => $r->order_number, 'items' => $items, 'total' => $r->total, 'created_at' => $r->created_at,
            ],
            'delivery' => [
                'order_number' => $r->order_number, 'items' => $items, 'delivery_area' => $r->delivery_area,
                'total' => $r->total, 'delivery_charges' => $r->delivery_charges,
                'customer_name' => $r->customer_name, 'customer_phone' => $r->customer_phone, 'address' => $r->address,
                'rider_name' => $r->rider_name, 'status' => $status, 'created_at' => $r->created_at,
            ],
            default => [
                'order_number' => $r->order_number, 'customer_name' => $r->customer_name, 'customer_phone' => $r->customer_phone,
                'items' => $items, 'status' => $status, 'total' => $r->total, 'delivery_charges' => $r->delivery_charges,
                'created_at' => $r->created_at,
            ],
        };
    }

    /** "Zinger Burger (Cheese, Large) x 2; Fries x 1" */
    private function itemsText(Order $order): string
    {
        return $order->items->map(function ($i) {
            $mods = collect($i->modifiers ?? [])->map(fn ($m) => $m['option']['name'] ?? $m['name'] ?? null)->filter()->implode(', ');

            return $i->name.($mods !== '' ? " ({$mods})" : '').' x '.$i->qty;
        })->implode('; ');
    }

    private function hasRider(Order $order): bool
    {
        return in_array($order->type, self::RIDER_TYPES, true);
    }

    /**
     * area id + name + charges snapshot. Keeping the same area keeps the charges the order was
     * placed with; a different area takes its current charges from the record; none clears them.
     */
    private function areaFields(Order $order, ?int $areaId): array
    {
        if ($areaId && $areaId === (int) $order->delivery_area_id) {
            return [];
        }
        $area = $areaId ? DeliveryArea::find($areaId) : null;

        return ['delivery_area_id' => $area?->id, 'delivery_area' => $area?->name, 'delivery_charges' => $area->delivery_charges ?? 0];
    }

    /** rider_id + rider_name snapshot for a (validated) rider id, or both cleared */
    private function riderFields(?int $riderId): array
    {
        $rider = $riderId ? Employee::find($riderId) : null;

        return ['rider_id' => $rider?->id, 'rider_name' => $rider?->name];
    }

    /** an order that is out for delivery must keep a rider */
    private function riderChangeError(Order $order, ?int $riderId): ?string
    {
        return (! $riderId && $order->status === 'OUT_FOR_DELIVERY')
            ? 'This order is out for delivery; it must keep a rider.'
            : null;
    }
}
