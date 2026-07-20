import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const expectedFeatureFiles = [
  'src/pages/NormsLookup.tsx',
  'src/pages/NormsLookup.css',
  'src/utils/norms.ts',
  'scripts/buildNormsIndex.mjs',
  'public/data/dinh-muc-2026.json',
];

test('dedicated norms lookup is routed, visible in navigation, and accessible', () => {
  const missingFiles = expectedFeatureFiles.filter(file => !existsSync(file));
  assert.deepEqual(missingFiles, [], `Thiếu tệp tính năng: ${missingFiles.join(', ')}`);

  const app = readFileSync('src/App.tsx', 'utf8');
  const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
  const page = readFileSync('src/pages/NormsLookup.tsx', 'utf8');
  const styles = readFileSync('src/pages/NormsLookup.css', 'utf8');
  const packageJson = readFileSync('package.json', 'utf8');

  assert.match(app, /const NormsLookup = lazy\(\(\) => import\('\.\/pages\/NormsLookup'\)\)/);
  assert.match(app, /path="dinh-muc"/);
  assert.match(sidebar, /path: '\/dinh-muc'/);
  assert.match(sidebar, /name: 'Định mức'/);
  assert.match(page, /type="search"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /aria-pressed=/);
  assert.match(page, /<table/);
  assert.match(page, /scope="col"/);
  assert.match(page, /aria-label="Trang trước"/);
  assert.match(page, /aria-label="Trang sau"/);
  assert.match(page, /role="region"/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /tableFrameRef\.current\?\.scrollTo/);
  assert.match(styles, /prefers-reduced-motion[\s\S]*animation:\s*none/);
  assert.match(packageJson, /"prebuild":\s*"npm run build:norms"/);
});

test('norms index preserves all workbook sheets as separate department groups', () => {
  const indexPath = 'public/data/dinh-muc-2026.json';
  assert.equal(existsSync(indexPath), true, 'Chưa sinh chỉ mục định mức cho WebApp');

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
    sourceFile: string;
    departmentCount: number;
    rowCount: number;
    formulaErrorCount: number;
    departments: Array<{
      id: string;
      name: string;
      columns: string[];
      formulaErrorCount: number;
      rows: Array<{ rowNumber: number; cells: Record<string, string> }>;
    }>;
  };
  const sourceLines = readFileSync('rag-sources/dinh-muc-2026.txt', 'utf8').split(/\r?\n/);
  const sourceFormulaErrorRows = sourceLines.filter(line => (
    /#(?:REF!|VALUE!|DIV\/0!|NAME\?|N\/A|NUM!|NULL!)/i.test(line)
    || /lỗi công thức/i.test(line)
  )).length;

  assert.equal(index.sourceFile, 'ĐỊNH MỨC 2026 10.7.26.xlsx');
  assert.equal(index.departmentCount, 18);
  assert.equal(index.departments.length, 18);
  assert.ok(index.rowCount > 4_500);
  assert.equal(new Set(index.departments.map(department => department.id)).size, 18);
  assert.ok(sourceFormulaErrorRows > 0);
  assert.equal(index.formulaErrorCount, sourceFormulaErrorRows);
  assert.equal(
    index.departments.reduce((total, department) => total + department.formulaErrorCount, 0),
    sourceFormulaErrorRows
  );

  const intensiveCare = index.departments.find(department => department.name === 'HOI SUC');
  assert.ok(intensiveCare, 'Thiếu sheet HOI SUC');
  assert.ok(intensiveCare.columns.includes('B'));
  assert.ok(intensiveCare.rows.some(row => row.cells.B === 'Bông hút y tế'));

  assert.ok(index.departments.some(department => department.name === 'PK thanh Vân'));
  assert.ok(index.departments.some(department => department.name === 'PK Thanh hà'));
});

test('norms helpers search without Vietnamese tones and clamp pagination', async () => {
  const utilityPath = 'src/utils/norms.ts';
  assert.equal(existsSync(utilityPath), true, 'Chưa có tiện ích lọc và phân trang định mức');

  const { filterNormRows, isNormFormulaError, paginateNormRows } = await import('../src/utils/norms.ts');
  const rows = [
    { rowNumber: 21, cells: { A: 'STT', B: 'Danh mục', C: 'Đơn vị' } },
    { rowNumber: 22, cells: { A: '1', B: 'Băng dính vải', C: 'Cm', D: '20' } },
    { rowNumber: 23, cells: { A: '2', B: 'Găng tay vô khuẩn', C: 'Đôi', D: '1' } },
  ];

  assert.deepEqual(filterNormRows(rows, 'bang dinh vai').map(row => row.rowNumber), [22]);
  assert.deepEqual(filterNormRows(rows, 'HANG 23').map(row => row.rowNumber), [23]);
  assert.equal(filterNormRows(rows, '  ').length, 3);
  assert.equal(isNormFormulaError('#REF! (lỗi công thức trong file gốc)'), true);
  assert.equal(isNormFormulaError('[Lỗi công thức từ Excel: #VALUE!]'), true);
  assert.equal(isNormFormulaError('20'), false);

  const manyRows = Array.from({ length: 120 }, (_, index) => ({
    rowNumber: index + 1,
    cells: { A: String(index + 1) },
  }));
  const lastPage = paginateNormRows(manyRows, 99, 50);

  assert.equal(lastPage.page, 3);
  assert.equal(lastPage.pageCount, 3);
  assert.equal(lastPage.items.length, 20);
  assert.equal(lastPage.items[0]?.rowNumber, 101);
});
