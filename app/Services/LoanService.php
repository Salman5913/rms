<?php

namespace App\Services;

use App\Helpers\DateRangeHelper;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Business loans the restaurant has taken and the repayments made on them.
 * Remaining = loan amount - its repayments. Status is calculated: "active" while remaining > 0, else "paid".
 *
 * Loans are borrowed money, not income or expenses: nothing here is used by SalesReportService,
 * DailyCloseService, VendorLedgerService, EmployeePaymentService or the Profit & Loss report.
 */
class LoanService
{
    public const PER_PAGE = 10;

    /** what has been repaid on loans.id, as SQL (used to filter by status) */
    private const REPAID_SQL = '(SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loan_repayments.loan_id = loans.id)';

    /* ---------------- list ---------------- */

    /** one page of loans (newest first) with repaid / remaining / status, plus totals of every loan matching the filters */
    public function list(array $filters): array
    {
        $range = $this->dateRange($filters);
        $search = trim($filters['search'] ?? '');
        $status = $filters['status'] ?? null;

        $query = Loan::query()->withSum('repayments as repaid', 'amount')
            ->when($range['from'], fn ($q) => $q->where('loan_date', '>=', $range['from']))
            ->when($range['to'], fn ($q) => $q->where('loan_date', '<=', $range['to']))
            ->when($status === Loan::ACTIVE, fn ($q) => $q->whereRaw('loans.amount > '.self::REPAID_SQL))
            ->when($status === Loan::PAID, fn ($q) => $q->whereRaw('loans.amount <= '.self::REPAID_SQL))
            ->when($search !== '', fn ($q) => $q->where(fn ($qq) => $qq
                ->where('lender_name', 'like', "%{$search}%")
                ->orWhere('lender_phone', 'like', "%{$search}%")
                ->orWhere('reference', 'like', "%{$search}%")
                ->orWhere('comment', 'like', "%{$search}%")));

        $totals = $this->totals(clone $query);

        $page = $query->orderByDesc('loan_date')->orderByDesc('id')
            ->paginate(self::PER_PAGE, ['*'], 'page', (int) ($filters['page'] ?? 1))
            ->through(fn (Loan $loan) => $this->present($loan, (float) $loan->repaid));

        return $page->toArray() + ['range' => $range, 'totals' => $totals];
    }

    /** the loan's fields plus repaid, remaining and status */
    public function present(Loan $loan, float $repaid): array
    {
        $remaining = round($loan->amount - $repaid, 2);

        return array_merge($loan->toArray(), [
            'repaid' => round($repaid, 2),
            'remaining' => $remaining,
            'status' => $remaining > 0 ? Loan::ACTIVE : Loan::PAID,
        ]);
    }

    /** loan amount - repayments; $exceptRepaymentId leaves one repayment out (when editing it) */
    public function remaining(Loan $loan, ?int $exceptRepaymentId = null): float
    {
        $repaid = $loan->repayments()->when($exceptRepaymentId, fn ($q) => $q->whereKeyNot($exceptRepaymentId))->sum('amount');

        return round($loan->amount - (float) $repaid, 2);
    }

    /* ---------------- statement ---------------- */

    /** the loan with ALL its repayments, oldest first, each with the remaining amount after it */
    public function statement(Loan $loan): array
    {
        $repayments = $loan->repayments()->with('creator:id,name')->orderBy('repayment_date')->orderBy('id')->get();

        $remaining = $loan->amount;
        $rows = [];
        foreach ($repayments as $r) {
            $remaining = round($remaining - $r->amount, 2);
            $rows[] = [
                'id' => $r->id,
                'repayment_date' => $r->repayment_date,
                'amount' => $r->amount,
                'payment_method' => $r->payment_method,
                'comment' => $r->comment,
                'created_by' => $r->creator?->name,
                'remaining_after' => $remaining,
            ];
        }

        $loan = $this->present($loan, (float) $repayments->sum('amount'));

        return [
            'restaurant' => config('app.name'),
            'loan' => $loan,
            'repayments' => $rows,
            'totals' => ['amount' => $loan['amount'], 'repaid' => $loan['repaid'], 'remaining' => $loan['remaining']],
        ];
    }

    /* ---------------- loans ---------------- */

    /** on edit: the amount can't drop below what's repaid, and the date can't move after the first repayment */
    public function checkLoanEdit(Loan $loan, array $data): void
    {
        $repaid = round((float) $loan->repayments()->sum('amount'), 2);
        if ((float) $data['amount'] < $repaid) {
            throw ValidationException::withMessages(['amount' => 'The amount cannot be less than what has already been repaid ('.$this->rs($repaid).').']);
        }

        $firstRepayment = $loan->repayments()->min('repayment_date');
        if ($firstRepayment && $data['loan_date'] > $firstRepayment) {
            throw ValidationException::withMessages(['loan_date' => "The loan date cannot be after its first repayment ({$firstRepayment})."]);
        }
    }

    /** loans with repayments can't be deleted (delete the repayments first) */
    public function assertDeletable(array $loanIds): void
    {
        if (Loan::whereIn('id', $loanIds)->whereHas('repayments')->exists()) {
            throw ValidationException::withMessages(['loan' => 'A loan with repayments cannot be deleted. Delete its repayments first.']);
        }
    }

    /* ---------------- repayments ---------------- */

    public function addRepayment(Loan $loan, array $data, User $user): LoanRepayment
    {
        $this->checkRepayment($loan, $data);

        return $loan->repayments()->create($data + ['created_by' => $user->id]);
    }

    public function updateRepayment(LoanRepayment $repayment, array $data): LoanRepayment
    {
        $this->checkRepayment($repayment->loan, $data, $repayment->id);
        $repayment->update($data);

        return $repayment;
    }

    /** not before the loan date, and not more than what is still owed (without this repayment's own amount when editing) */
    private function checkRepayment(Loan $loan, array $data, ?int $exceptRepaymentId = null): void
    {
        if ($data['repayment_date'] < $loan->loan_date) {
            throw ValidationException::withMessages(['repayment_date' => "The date cannot be before the loan date ({$loan->loan_date})."]);
        }

        $remaining = $this->remaining($loan, $exceptRepaymentId);
        if (round((float) $data['amount'], 2) > $remaining) {
            throw ValidationException::withMessages(['amount' => 'The amount cannot be more than the remaining '.$this->rs($remaining).'.']);
        }
    }

    /* ---------------- internals ---------------- */

    /** 10000 -> "Rs. 10,000.00" for error messages */
    private function rs(float $amount): string
    {
        return 'Rs. '.number_format($amount, 2);
    }

    /** ?range= preset (DateRangeHelper) or ?range=custom with from / to; no range = all dates */
    private function dateRange(array $filters): array
    {
        $range = $filters['range'] ?? 'all';
        if ($range !== 'custom') {
            return DateRangeHelper::forPreset($range);
        }

        return ['from' => $filters['from'] ?? null, 'to' => $filters['to'] ?? null];
    }

    /** borrowed / repaid / remaining across every loan of the (unpaginated) query */
    private function totals(Builder $query): array
    {
        $row = DB::query()->fromSub($query->toBase(), 'l')
            ->selectRaw('COALESCE(SUM(amount), 0) as borrowed, COALESCE(SUM(repaid), 0) as repaid')
            ->first();

        $borrowed = round((float) $row->borrowed, 2);
        $repaid = round((float) $row->repaid, 2);

        return ['borrowed' => $borrowed, 'repaid' => $repaid, 'remaining' => round($borrowed - $repaid, 2)];
    }
}
