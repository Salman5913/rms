<?php

namespace Tests\Unit;

use App\Helpers\DateRangeHelper;
use Illuminate\Support\Carbon;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class DateRangeHelperTest extends TestCase
{
    private function range(string $preset, string $today): array
    {
        return DateRangeHelper::forPreset($preset, Carbon::parse($today));
    }

    public function test_quick_ranges(): void
    {
        $wed = '2026-11-18';   // a Wednesday

        $this->assertSame(['from' => '2026-11-18', 'to' => '2026-11-18'], $this->range('today', $wed));
        $this->assertSame(['from' => '2026-11-17', 'to' => '2026-11-17'], $this->range('yesterday', $wed));
        $this->assertSame(['from' => '2026-11-16', 'to' => '2026-11-18'], $this->range('this_week', $wed));
        $this->assertSame(['from' => '2026-11-01', 'to' => '2026-11-18'], $this->range('this_month', $wed));
        $this->assertSame(['from' => '2026-01-01', 'to' => '2026-11-18'], $this->range('this_year', $wed));
        $this->assertSame(['from' => null, 'to' => null], $this->range('all', $wed));
    }

    public function test_week_starts_on_monday(): void
    {
        // Monday itself starts the week
        $this->assertSame(['from' => '2026-11-16', 'to' => '2026-11-16'], $this->range('this_week', '2026-11-16'));
        // Sunday still belongs to the week that began the previous Monday
        $this->assertSame(['from' => '2026-11-16', 'to' => '2026-11-22'], $this->range('this_week', '2026-11-22'));
    }

    public function test_ranges_across_month_and_year_boundaries(): void
    {
        $this->assertSame(['from' => '2025-12-31', 'to' => '2025-12-31'], $this->range('yesterday', '2026-01-01'));
        // Thursday 1 Jan 2026: the week began on Monday 29 Dec 2025
        $this->assertSame(['from' => '2025-12-29', 'to' => '2026-01-01'], $this->range('this_week', '2026-01-01'));
    }

    public function test_unknown_preset_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);
        DateRangeHelper::forPreset('forever');
    }
}
