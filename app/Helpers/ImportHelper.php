<?php

namespace App\Helpers;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use SimpleXMLElement;
use ZipArchive;

/**
 * Shared CSV / Excel (.xlsx) importer. Every module import runs through here:
 * the caller says which model to insert into and how a row maps to it.
 *
 * Rows are matched on the `match` column (default "name"): if a record with that
 * value already exists it is updated, otherwise a new one is created.
 *
 * $config keys:
 *   columns  string[]  header names, in order (also used for the sample file)
 *   match    string    column used to find an existing record (default "name")
 *   rules    array|callable  validation rules per row (after casting), or
 *                      fn(?Model $existing): array when rules depend on the record.
 *                      On update, "required" is relaxed to "sometimes" automatically.
 *   lists    string[]  columns holding several IDs, separated by "|" or ";"  e.g. "1|4|7"
 *   booleans string[]  columns accepting 1/0, true/false, yes/no
 *   distinct string[]  extra columns that must not repeat within the file (e.g. email)
 *   prepare  callable  fn(array $row): array  → attributes for create()/update()
 *   after    callable  fn(Model $model, array $row): void  → sync relations etc.
 *
 * On update, a blank cell keeps the existing value: attributes for file columns
 * that were left empty are not written. Derived attributes (e.g. slug) always are.
 */
class ImportHelper
{
    public const MAX_ROWS = 5000;

    /**
     * Validate every row first; write nothing unless all rows pass.
     *
     * @return array{created: int, updated: int}
     */
    public function import(UploadedFile $file, string $model, array $config): array
    {
        $rows = $this->read($file);

        if ($rows === []) {
            throw ValidationException::withMessages(['file' => 'The file has no data rows.']);
        }
        if (count($rows) > self::MAX_ROWS) {
            throw ValidationException::withMessages(['file' => 'Too many rows (max '.self::MAX_ROWS.' per file).']);
        }

        $this->assertHeaders(array_keys($rows[0]), $config['columns']);

        $match = $config['match'] ?? 'name';
        $rows = array_map(fn ($r) => $this->cast($r, $config), $rows);
        $existing = $this->existing($model, $match, $rows);

        $valid = [];
        $errors = [];
        $seen = [];
        foreach ($rows as $i => $row) {
            $line = 'row_'.($i + 2); // header is line 1, data starts at line 2

            // the match column must be unique in the file, or two rows would fight over one record
            foreach (array_unique([$match, ...($config['distinct'] ?? [])]) as $col) {
                $key = mb_strtolower((string) ($row[$col] ?? ''));
                if ($key !== '' && isset($seen[$col][$key])) {
                    $errors[$line][] = "The {$col} \"{$row[$col]}\" is repeated in the file (first on line {$seen[$col][$key]}).";
                }
                $seen[$col][$key] ??= $i + 2;
            }

            $record = $existing[mb_strtolower((string) ($row[$match] ?? ''))] ?? null;
            $rules = is_callable($config['rules']) ? $config['rules']($record) : $config['rules'];
            if ($record) {
                $rules = $this->relaxForUpdate($rules);
            }

            $v = Validator::make($row, $rules);
            if ($v->fails()) {
                foreach ($v->errors()->all() as $msg) {
                    $errors[$line][] = $msg;
                }

                continue;
            }
            $valid[] = [$v->validated(), $record];
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $prepare = $config['prepare'] ?? fn (array $r) => $r;
        $after = $config['after'] ?? null;
        $columns = $config['columns'];
        $counts = ['created' => 0, 'updated' => 0];

        DB::transaction(function () use ($valid, $model, $prepare, $after, $columns, &$counts) {
            foreach ($valid as [$row, $record]) {
                $attrs = $prepare($row);

                if ($record) {
                    // blank cell → keep the current value
                    $attrs = array_filter($attrs, fn ($k) => ! in_array($k, $columns, true) || array_key_exists($k, $row), ARRAY_FILTER_USE_KEY);
                    $record->update($attrs);
                    $m = $record;
                    $counts['updated']++;
                } else {
                    $m = $model::create($attrs);
                    $counts['created']++;
                }

                if ($after) {
                    $after($m, $row);
                }
            }
        });

        return $counts;
    }

    /** on update a blank cell keeps the current value, so "required" becomes "only check if given" */
    private function relaxForUpdate(array $rules): array
    {
        return array_map(function ($rule) {
            $parts = is_string($rule) ? explode('|', $rule) : $rule;

            return array_map(fn ($p) => $p === 'required' ? 'sometimes' : $p, $parts);
        }, $rules);
    }

    /** existing records whose match column equals a value in the file, keyed by lower-cased value */
    private function existing(string $model, string $match, array $rows): array
    {
        $values = array_values(array_unique(array_filter(array_map(fn ($r) => $r[$match] ?? null, $rows))));
        $found = [];
        foreach (array_chunk($values, 500) as $chunk) {
            foreach ($model::whereIn($match, $chunk)->get() as $m) {
                $found[mb_strtolower((string) $m->{$match})] ??= $m;
            }
        }

        return $found;
    }

    /** CSV content (header row + one example row) for the sample download */
    public function sample(array $columns, array $example = []): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, $columns);
        fputcsv($out, array_map(fn ($c) => $example[$c] ?? '', $columns));
        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);

        return $csv;
    }

    /** @return array<int, array<string, string>> rows keyed by header */
    public function read(UploadedFile $file): array
    {
        $ext = strtolower($file->getClientOriginalExtension());
        $matrix = match ($ext) {
            'csv', 'txt' => $this->readCsv($file->getRealPath()),
            'xlsx' => $this->readXlsx($file->getRealPath()),
            default => throw ValidationException::withMessages(['file' => 'Upload a .csv or .xlsx file.']),
        };

        // drop fully empty lines
        $matrix = array_values(array_filter($matrix, fn ($r) => implode('', array_map('trim', $r)) !== ''));
        if (count($matrix) < 1) {
            return [];
        }

        $header = array_map(fn ($h) => strtolower(trim((string) $h)), array_shift($matrix));

        return array_map(function ($cells) use ($header) {
            $row = [];
            foreach ($header as $i => $h) {
                if ($h !== '') {
                    $row[$h] = trim((string) ($cells[$i] ?? ''));
                }
            }

            return $row;
        }, $matrix);
    }

    private function readCsv(string $path): array
    {
        $content = file_get_contents($path);
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content); // Excel's UTF-8 BOM

        // Excel in some locales saves with ";" — pick whichever appears more in the header
        $firstLine = strtok($content, "\r\n") ?: '';
        $delimiter = substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';

        $fh = fopen('php://temp', 'r+');
        fwrite($fh, $content);
        rewind($fh);
        $rows = [];
        while (($r = fgetcsv($fh, 0, $delimiter, '"', '')) !== false) {
            $rows[] = $r;
        }
        fclose($fh);

        return $rows;
    }

    /** minimal .xlsx reader (first worksheet) using the built-in zip + xml extensions */
    private function readXlsx(string $path): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            throw ValidationException::withMessages(['file' => 'Could not open the Excel file.']);
        }

        try {
            $shared = [];
            if (($xml = $zip->getFromName('xl/sharedStrings.xml')) !== false) {
                foreach ($this->xml($xml)->si as $si) {
                    $shared[] = $this->xlsxText($si);
                }
            }

            $sheetPath = $this->firstSheetPath($zip);
            if (($xml = $zip->getFromName($sheetPath)) === false) {
                throw new RuntimeException('Worksheet not found');
            }

            $rows = [];
            foreach ($this->xml($xml)->sheetData->row as $r) {
                $cells = [];
                foreach ($r->c as $c) {
                    $col = $this->columnIndex((string) $c['r']) ?? count($cells);
                    $type = (string) $c['t'];
                    $value = match ($type) {
                        's' => $shared[(int) $c->v] ?? '',
                        'inlineStr' => $this->xlsxText($c->is),
                        'b' => ((string) $c->v) === '1' ? '1' : '0',
                        default => (string) $c->v,
                    };
                    $cells[$col] = $value;
                }
                if ($cells) {
                    $max = max(array_keys($cells));
                    $rows[] = array_replace(array_fill(0, $max + 1, ''), $cells);
                }
            }

            return $rows;
        } catch (RuntimeException $e) {
            throw ValidationException::withMessages(['file' => 'Could not read the Excel file: '.$e->getMessage()]);
        } finally {
            $zip->close();
        }
    }

    private function firstSheetPath(ZipArchive $zip): string
    {
        $wb = $zip->getFromName('xl/workbook.xml');
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($wb === false || $rels === false) {
            return 'xl/worksheets/sheet1.xml';
        }

        $wbXml = $this->xml($wb);
        $sheet = $wbXml->sheets->sheet[0] ?? null;
        $rid = $sheet ? (string) $sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'] : '';

        foreach ($this->xml($rels)->Relationship as $rel) {
            if ((string) $rel['Id'] === $rid) {
                $target = ltrim((string) $rel['Target'], '/');

                return str_starts_with($target, 'xl/') ? $target : 'xl/'.$target;
            }
        }

        return 'xl/worksheets/sheet1.xml';
    }

    private function xml(string $content): SimpleXMLElement
    {
        $prev = libxml_use_internal_errors(true);
        $xml = simplexml_load_string($content, SimpleXMLElement::class, LIBXML_NONET);
        libxml_use_internal_errors($prev);
        if ($xml === false) {
            throw new RuntimeException('Invalid XML');
        }

        return $xml;
    }

    /** text of a shared/inline string, including rich-text runs */
    private function xlsxText(?SimpleXMLElement $node): string
    {
        if (! $node) {
            return '';
        }
        if (isset($node->t)) {
            return (string) $node->t;
        }
        $text = '';
        foreach ($node->r as $run) {
            $text .= (string) $run->t;
        }

        return $text;
    }

    /** "C12" → 2 */
    private function columnIndex(string $ref): ?int
    {
        if (! preg_match('/^([A-Z]+)/', $ref, $m)) {
            return null;
        }
        $n = 0;
        foreach (str_split($m[1]) as $ch) {
            $n = $n * 26 + (ord($ch) - 64);
        }

        return $n - 1;
    }

    private function assertHeaders(array $headers, array $expected): void
    {
        $missing = array_diff($expected, $headers);
        // only complain about required columns that are absent entirely
        if (count($missing) === count($expected)) {
            throw ValidationException::withMessages([
                'file' => 'No matching columns found. Expected: '.implode(', ', $expected).'. Download the sample file for the right headers.',
            ]);
        }
    }

    private function cast(array $row, array $config): array
    {
        $row = array_intersect_key($row, array_flip($config['columns']));

        foreach ($row as $k => $v) {
            if ($v === '') {
                $row[$k] = null;
            }
        }

        foreach ($config['booleans'] ?? [] as $col) {
            if (isset($row[$col])) {
                $b = filter_var($row[$col], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                $row[$col] = $b ?? $row[$col]; // leave invalid values for the validator to reject
            }
        }

        foreach ($config['lists'] ?? [] as $col) {
            if (isset($row[$col])) {
                $row[$col] = array_values(array_filter(array_map('trim', preg_split('/[|;]/', (string) $row[$col])), fn ($x) => $x !== ''));
            }
        }

        return array_filter($row, fn ($v) => $v !== null);
    }
}
