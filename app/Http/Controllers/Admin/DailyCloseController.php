<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\CloseDayRequest;
use App\Http\Requests\ReopenDayRequest;
use App\Models\DailyClose;
use App\Services\DailyCloseService;
use App\Services\SalesReportService;
use Illuminate\Http\Request;

class DailyCloseController extends Controller
{
    public function __construct(private DailyCloseService $closes, private SalesReportService $sales) {}

    /** figures for a date: the saved snapshot when closed, live figures otherwise */
    public function show(Request $request)
    {
        $date = $request->validate(['date' => 'nullable|date_format:Y-m-d'])['date'] ?? now()->toDateString();
        $close = $this->closes->latestClose($date)?->load('closedBy:id,name', 'reopenedBy:id,name');
        $isClosed = $close?->status === DailyClose::STATUS_CLOSED;

        return response()->json([
            'date' => $date,
            'restaurant' => config('app.name'),
            'is_future' => $date > now()->toDateString(),
            'status' => $close->status ?? 'open',
            'close' => $close,
            'summary' => $isClosed ? $close->summary : $this->sales->forDate($date),
            'blocking_orders' => $isClosed ? [] : $this->closes->blockingOrders($date),
            'placed_after_close' => $this->closes->placedAfterClose($date, $close),
        ]);
    }

    /** close history, newest first */
    public function index(Request $request)
    {
        $page = DailyClose::with('closedBy:id,name', 'reopenedBy:id,name')
            ->orderByDesc('business_date')->orderByDesc('id')
            ->paginate((int) $request->query('per_page', 10));

        // the list only needs the headline figure, not the whole snapshot
        $page->getCollection()->transform(function (DailyClose $c) {
            $c->total_sales = $c->summary['total_sales'] ?? 0;

            return $c->makeHidden('summary');
        });

        return response()->json($page);
    }

    public function store(CloseDayRequest $request)
    {
        $data = $request->validated();
        $close = $this->closes->close($data['date'], $request->user(), $data['cash_counted'] ?? null, $data['notes'] ?? null);

        return response()->json($close->load('closedBy:id,name'), 201);
    }

    public function reopen(ReopenDayRequest $request, $id)
    {
        $close = $this->closes->reopen(DailyClose::findOrFail($id), $request->user(), $request->validated()['reason']);

        return response()->json($close->load('closedBy:id,name', 'reopenedBy:id,name'));
    }
}
