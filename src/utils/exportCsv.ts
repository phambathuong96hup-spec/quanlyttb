export type CsvRow = Record<string, unknown>;

const toCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const escapeCsvCell = (value: unknown) => {
  const cell = toCell(value);
  if (!/[",\r\n]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
};

const ensureCsvExtension = (filename: string) => (
  filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
);

export const exportCsv = (rows: CsvRow[], filename: string) => {
  if (rows.length === 0) return;

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(',')),
  ];

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = ensureCsvExtension(filename);
  link.click();
  URL.revokeObjectURL(url);
};
