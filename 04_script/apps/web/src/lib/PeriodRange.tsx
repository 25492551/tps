import { formatKst } from './api';

/** Text for filters / a11y: "from ~ to" on one line. */
export function periodRangeText(start: string | Date, end: string | Date): string {
  return `${formatKst(start)} ~ ${formatKst(end)}`;
}

/**
 * Period column display: start on first line; "~ end" on second line, right-aligned.
 */
export function PeriodRange({
  start,
  end,
}: {
  start: string | Date;
  end: string | Date;
}) {
  return (
    <span className="period-range">
      <span className="period-range-from">{formatKst(start)}</span>
      <span className="period-range-to">~ {formatKst(end)}</span>
    </span>
  );
}
