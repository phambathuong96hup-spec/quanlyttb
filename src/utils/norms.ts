export type NormRowKind = 'title' | 'header' | 'section' | 'data';

export interface NormRow {
  rowNumber: number;
  cells: Record<string, string>;
  kind: NormRowKind;
  hasFormulaError: boolean;
}

export interface NormDepartment {
  id: string;
  name: string;
  sourceSheet: string;
  sourceRange: string;
  columns: string[];
  rowCount: number;
  formulaErrorCount: number;
  rows: NormRow[];
}

export interface NormsIndex {
  version: number;
  title: string;
  year: number;
  sourceFile: string;
  departmentCount: number;
  rowCount: number;
  formulaErrorCount: number;
  departments: NormDepartment[];
}

export interface NormRowLike {
  rowNumber: number;
  cells: Record<string, string>;
}

export interface PaginatedRows<T> {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  startItem: number;
  endItem: number;
}

const FORMULA_ERROR_PATTERN = /(?:\[Lỗi công thức từ Excel:|#(?:REF!|VALUE!|DIV\/0!|NAME\?|N\/A|NUM!|NULL!))/i;

export const normalizeNormSearch = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, character => character === 'Đ' ? 'D' : 'd')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export const isNormFormulaError = (value: unknown) => (
  FORMULA_ERROR_PATTERN.test(String(value ?? ''))
);

export const filterNormRows = <T extends NormRowLike>(rows: T[], query: string): T[] => {
  const normalizedQuery = normalizeNormSearch(query);
  if (!normalizedQuery) return rows;

  return rows.filter(row => {
    const searchableText = [
      `Hàng ${row.rowNumber}`,
      ...Object.values(row.cells),
    ].join(' ');

    return normalizeNormSearch(searchableText).includes(normalizedQuery);
  });
};

export const paginateNormRows = <T>(
  rows: T[],
  requestedPage: number,
  requestedPageSize = 50
): PaginatedRows<T> => {
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
    ? Math.floor(requestedPageSize)
    : 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const numericPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.min(pageCount, Math.max(1, numericPage));
  const startIndex = (page - 1) * pageSize;
  const items = rows.slice(startIndex, startIndex + pageSize);

  return {
    items,
    page,
    pageCount,
    pageSize,
    totalItems: rows.length,
    startItem: rows.length === 0 ? 0 : startIndex + 1,
    endItem: startIndex + items.length,
  };
};
