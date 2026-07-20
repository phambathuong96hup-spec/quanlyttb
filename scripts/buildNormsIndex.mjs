import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve('rag-sources/dinh-muc-2026.txt');
const outputPath = resolve('public/data/dinh-muc-2026.json');
const lines = readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
const formulaErrorPattern = /(?:\[Lỗi công thức từ Excel:|#(?:REF!|VALUE!|DIV\/0!|NAME\?|N\/A|NUM!|NULL!))/i;

const normalizeText = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, character => character === 'Đ' ? 'D' : 'd')
  .toUpperCase()
  .trim();

const slugify = value => normalizeText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'khoa-phong';

const columnOrder = column => column.split('').reduce(
  (total, character) => total * 26 + character.charCodeAt(0) - 64,
  0
);

const classifyRow = cells => {
  const entries = Object.entries(cells);
  const values = Object.values(cells).map(normalizeText);
  const joined = values.join(' ');

  if (joined.includes('DANH MUC DINH MUC') || joined.includes('TRUNG TAM Y TE')) return 'title';
  if (values.includes('STT') && values.some(value => value.includes('DANH MUC'))) return 'header';
  if (entries.length === 1 || (!cells.A && cells.B)) return 'section';
  return 'data';
};

const parseCells = value => {
  const cells = {};
  const cellPattern = /(?:^| \| )([A-Z]+):\s*(.*?)(?= \| [A-Z]+:|$)/g;
  let match;

  while ((match = cellPattern.exec(value)) !== null) {
    cells[match[1]] = match[2].trim();
  }

  return cells;
};

const departments = [];
let currentDepartment = null;

for (const line of lines) {
  const departmentMatch = line.match(/^Phụ lục dữ liệu - Khoa\/phòng:\s*(.+)$/u);
  if (departmentMatch) {
    currentDepartment = {
      name: departmentMatch[1].trim(),
      sourceSheet: departmentMatch[1].trim(),
      sourceRange: '',
      rows: [],
    };
    departments.push(currentDepartment);
    continue;
  }

  if (!currentDepartment) continue;

  const sourceMatch = line.match(/^Nguồn:\s*(.+?);\s*sheet:\s*(.+?);\s*phạm vi:\s*(.+)$/u);
  if (sourceMatch) {
    currentDepartment.sourceSheet = sourceMatch[2].trim();
    currentDepartment.sourceRange = sourceMatch[3].trim();
    continue;
  }

  const rowMatch = line.match(/^Hàng\s+(\d+)\s+\|\s+(.+)$/u);
  if (!rowMatch) continue;

  const cells = parseCells(rowMatch[2]);
  if (Object.keys(cells).length === 0) continue;

  currentDepartment.rows.push({
    rowNumber: Number(rowMatch[1]),
    cells,
    kind: classifyRow(cells),
    hasFormulaError: Object.values(cells).some(value => formulaErrorPattern.test(value)),
  });
}

const usedIds = new Map();
const normalizedDepartments = departments.map(department => {
  const baseId = slugify(department.name);
  const duplicateIndex = (usedIds.get(baseId) ?? 0) + 1;
  usedIds.set(baseId, duplicateIndex);
  const id = duplicateIndex === 1 ? baseId : `${baseId}-${duplicateIndex}`;
  const columns = Array.from(new Set(
    department.rows.flatMap(row => Object.keys(row.cells))
  )).sort((first, second) => columnOrder(first) - columnOrder(second));
  const formulaErrorCount = department.rows.filter(row => row.hasFormulaError).length;

  return {
    id,
    name: department.name,
    sourceSheet: department.sourceSheet,
    sourceRange: department.sourceRange,
    columns,
    rowCount: department.rows.length,
    formulaErrorCount,
    rows: department.rows,
  };
});

const rowCount = normalizedDepartments.reduce((total, department) => total + department.rowCount, 0);
const formulaErrorCount = normalizedDepartments.reduce(
  (total, department) => total + department.formulaErrorCount,
  0
);
const index = {
  version: 1,
  title: 'Định mức vật tư y tế tiêu hao năm 2026',
  year: 2026,
  sourceFile: 'ĐỊNH MỨC 2026 10.7.26.xlsx',
  departmentCount: normalizedDepartments.length,
  rowCount,
  formulaErrorCount,
  departments: normalizedDepartments,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(index)}\n`, 'utf8');

console.log(`Đã sinh ${normalizedDepartments.length} khoa/phòng, ${rowCount} hàng tại ${outputPath}`);
