import { useCallback, useMemo, useState } from 'react';

export type FilterFieldDef<T> = {
  key: string;
  label: string;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
  align?: 'left' | 'right';
  get: (row: T) => string;
};

/** Table column class for right-aligned money / numeric cells. */
export function colAmountClass<T>(field: FilterFieldDef<T> | null | undefined): string | undefined {
  return field?.align === 'right' ? 'col-amount' : undefined;
}

export function applyTableFilters<T>(
  rows: T[],
  values: Record<string, string>,
  fields: FilterFieldDef<T>[],
): T[] {
  const active = fields.filter((f) => String(values[f.key] ?? '').trim() !== '');
  if (!active.length) return rows;
  return rows.filter((row) =>
    active.every((field) => {
      const cell = String(field.get(row) ?? '');
      const q = String(values[field.key]).trim();
      if (field.type === 'select') return cell === q;
      return cell.toLowerCase().includes(q.toLowerCase());
    }),
  );
}

export function useMultiFilters<T>(fields: FilterFieldDef<T>[], rows: T[]) {
  const [values, setValues] = useState<Record<string, string>>({});

  const setValue = useCallback((key: string, value: string) => {
    setValues((prev) => {
      if ((prev[key] ?? '') === value) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  const clearFilters = useCallback(() => setValues({}), []);

  const setFilters = useCallback((next: Array<{ key: string; value: string }>) => {
    const map: Record<string, string> = {};
    for (const f of next) {
      if (f.key) map[f.key] = f.value ?? '';
    }
    setValues(map);
  }, []);

  const filtered = useMemo(
    () => applyTableFilters(rows, values, fields),
    [rows, values, fields],
  );

  return {
    values,
    setValue,
    setFilters,
    clearFilters,
    filtered,
    totalCount: rows.length,
    shownCount: filtered.length,
  };
}

export function filterCols<T>(
  fields: FilterFieldDef<T>[],
  keys: Array<string | null>,
): Array<FilterFieldDef<T> | null> {
  return keys.map((k) => (k == null ? null : fields.find((f) => f.key === k) ?? null));
}

export function TableCount({ shown, total }: { shown: number; total: number }) {
  if (total === 0) return null;
  return (
    <p className="table-count">{shown === total ? `${total}건` : `${shown} / ${total}건`}</p>
  );
}

export function TableHeaderRow<T>({ columns }: { columns: Array<FilterFieldDef<T> | null> }) {
  return (
    <tr>
      {columns.map((field, i) =>
        field ? (
          <th key={field.key} className={colAmountClass(field)}>
            {field.label}
          </th>
        ) : (
          <th key={`nh-${i}`} aria-hidden />
        ),
      )}
    </tr>
  );
}

export function ColumnFilterRow<T>({
  columns,
  values,
  onChange,
}: {
  columns: Array<FilterFieldDef<T> | null>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <tr className="col-filter-row">
      {columns.map((field, i) => {
        if (!field) {
          return <th key={`nf-${i}`} aria-hidden />;
        }
        const v = values[field.key] ?? '';
        if (field.type === 'select') {
          return (
            <th key={field.key} className={colAmountClass(field)}>
              <select
                className="col-filter"
                value={v}
                onChange={(e) => onChange(field.key, e.target.value)}
                aria-label={`${field.label} 필터`}
              >
                <option value="">전체</option>
                {(field.options || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </th>
          );
        }
        return (
          <th key={field.key} className={colAmountClass(field)}>
            <input
              className="col-filter"
              type="search"
              value={v}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder="검색"
              aria-label={`${field.label} 필터`}
            />
          </th>
        );
      })}
    </tr>
  );
}
