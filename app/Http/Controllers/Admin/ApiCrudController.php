<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\FiltersByDateRange;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Generic JSON CRUD: list(+search+paginate+csv export), all, show, store,
 * update, destroy, bulkDelete. (Imports: see ImportController.)
 * Concrete controllers define: $model, $search, $rules, $with, syncRelations().
 */
abstract class ApiCrudController extends Controller
{
    use FiltersByDateRange;

    protected string $model;

    protected array $search = ['name'];

    protected array $rules = [];

    protected array $with = [];

    abstract protected function syncRelations($model, array $data): void;

    public function index(Request $request)
    {
        $q = $this->model::query()->with($this->with);
        $this->filter($q, $request);

        if ($s = $request->query('search')) {
            $q->where(function ($qq) use ($s) {
                foreach ($this->search as $col) {
                    $qq->orWhere($col, 'like', "%{$s}%");
                }
            });
        }

        if ($request->query('all') === '1') {
            return response()->json($q->orderBy('id')->get());
        }

        if ($request->query('export') === 'csv') {
            $this->applyDateRange($q, $request);

            return $this->export($q->orderBy('id')->get(), $this->exportFileName(class_basename($this->model), $request));
        }

        return response()->json($q->orderByDesc('id')->paginate((int) $request->query('per_page', 10)));
    }

    public function all()
    {
        return response()->json($this->model::orderBy('name')->get(['id', 'name']));
    }

    public function show($id)
    {
        return response()->json($this->model::with($this->with)->findOrFail($id));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request));
        $model = DB::transaction(function () use ($data) {
            $m = $this->model::create($this->fields($data));
            $this->syncRelations($m, $data);

            return $m;
        });

        return response()->json($this->model::with($this->with)->find($model->id), 201);
    }

    public function update(Request $request, $id)
    {
        $model = $this->model::findOrFail($id);
        $data = $request->validate($this->rules($request, $model));
        DB::transaction(function () use ($model, $data) {
            $model->update($this->fields($data));
            $this->syncRelations($model, $data);
        });

        return response()->json($this->model::with($this->with)->find($model->id));
    }

    public function destroy($id)
    {
        $this->model::findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    public function bulkDelete(Request $request)
    {
        $ids = $request->validate(['ids' => 'required|array'])['ids'];
        $this->model::whereIn('id', $ids)->delete();

        return response()->json(['ok' => true, 'deleted' => count($ids)]);
    }

    protected function rules(Request $request, $model = null): array
    {
        return $this->rules;
    }

    /** extra list filters from the query string (none by default) */
    protected function filter($query, Request $request): void {}

    /** pick only fillable fields present in validated data */
    protected function fields(array $data): array
    {
        return collect($data)->only((new $this->model)->getFillable())->toArray();
    }

    protected function export($rows, string $fileName)
    {
        $callback = function () use ($rows) {
            $out = fopen('php://output', 'w');
            if ($rows->isEmpty()) {
                fclose($out);

                return;
            }
            fputcsv($out, array_keys($rows->first()->getAttributes()));
            foreach ($rows as $r) {
                fputcsv($out, collect($r->getAttributes())->map(
                    fn ($v) => is_string($v) && strlen($v) > 50 ? substr($v, 0, 50) : $v
                )->toArray());
            }
            fclose($out);
        };

        return response()->streamDownload($callback, $fileName, [
            'Content-Type' => 'text/csv',
        ]);
    }
}
