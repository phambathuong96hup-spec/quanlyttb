import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  filterNormRows,
  isNormFormulaError,
  paginateNormRows,
  type NormDepartment,
  type NormRow,
  type NormsIndex,
} from '../utils/norms';
import './NormsLookup.css';

const PAGE_SIZE = 50;
const NUMBER_FORMATTER = new Intl.NumberFormat('vi-VN');
const INDEX_URL = `${import.meta.env.BASE_URL}data/dinh-muc-2026.json`;

type LoadStatus = 'loading' | 'ready' | 'error';

const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);

const FormulaErrorValue: React.FC<{ value: string }> = ({ value }) => (
  <span className="norms-formula-error">
    <TriangleAlert size={14} aria-hidden="true" />
    <span>{value}</span>
  </span>
);

const NormsLookup: React.FC = () => {
  const [normsIndex, setNormsIndex] = useState<NormsIndex | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const tableFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadNormsIndex = async () => {
      setLoadStatus('loading');
      setLoadError('');

      try {
        const response = await fetch(INDEX_URL, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Không tải được dữ liệu (HTTP ${response.status}).`);
        }

        const parsed = await response.json() as NormsIndex;
        if (!Array.isArray(parsed.departments) || parsed.departments.length === 0) {
          throw new Error('Tệp dữ liệu định mức không có khoa/phòng hợp lệ.');
        }

        setNormsIndex(parsed);
        setSelectedDepartmentId(previousId => (
          parsed.departments.some(department => department.id === previousId)
            ? previousId
            : parsed.departments[0].id
        ));
        setLoadStatus('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu định mức.');
        setLoadStatus('error');
      }
    };

    void loadNormsIndex();
    return () => controller.abort();
  }, [loadAttempt]);

  const selectedDepartment = useMemo<NormDepartment | null>(() => (
    normsIndex?.departments.find(department => department.id === selectedDepartmentId)
      ?? normsIndex?.departments[0]
      ?? null
  ), [normsIndex, selectedDepartmentId]);

  const filteredRows = useMemo<NormRow[]>(() => (
    selectedDepartment ? filterNormRows(selectedDepartment.rows, query) : []
  ), [query, selectedDepartment]);

  const paginatedRows = useMemo(
    () => paginateNormRows(filteredRows, page, PAGE_SIZE),
    [filteredRows, page]
  );

  const resetTableViewport = () => {
    tableFrameRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const chooseDepartment = (departmentId: string) => {
    resetTableViewport();
    setSelectedDepartmentId(departmentId);
    setQuery('');
    setPage(1);
  };

  const updateQuery = (value: string) => {
    resetTableViewport();
    setQuery(value);
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    resetTableViewport();
    setPage(nextPage);
  };

  return (
    <main className="norms-page" aria-labelledby="norms-page-title" aria-busy={loadStatus === 'loading'}>
      <header className="norms-hero">
        <div className="norms-hero-copy">
          <div className="norms-hero-icon" aria-hidden="true">
            <BookOpen size={27} />
          </div>
          <div>
            <div className="norms-kicker">Sổ tra cứu nội bộ · 2026</div>
            <h1 id="norms-page-title">Định mức vật tư y tế</h1>
            <p>
              Tra cứu độc lập theo từng khoa/phòng từ tệp định mức gốc, không phụ thuộc vào câu trả lời của AI.
            </p>
          </div>
        </div>
        <div className="norms-source-stamp" aria-label="Nguồn dữ liệu">
          <FileSpreadsheet size={20} aria-hidden="true" />
          <div>
            <span>Nguồn dữ liệu</span>
            <strong>{normsIndex?.sourceFile ?? 'ĐỊNH MỨC 2026 10.7.26.xlsx'}</strong>
          </div>
        </div>
      </header>

      {normsIndex && (
        <dl className="norms-stat-strip" aria-label="Tổng quan dữ liệu định mức">
          <div>
            <dt><Building2 size={16} aria-hidden="true" /> Khoa/phòng</dt>
            <dd>{formatNumber(normsIndex.departmentCount)}</dd>
          </div>
          <div>
            <dt><Database size={16} aria-hidden="true" /> Hàng dữ liệu</dt>
            <dd>{formatNumber(normsIndex.rowCount)}</dd>
          </div>
          <div>
            <dt>Sheet đang xem</dt>
            <dd>{selectedDepartment?.name ?? '—'}</dd>
          </div>
          <div className={normsIndex.formulaErrorCount > 0 ? 'has-warning' : ''}>
            <dt>Lỗi công thức nguồn</dt>
            <dd>{formatNumber(normsIndex.formulaErrorCount)}</dd>
          </div>
        </dl>
      )}

      {loadStatus === 'loading' && (
        <section className="norms-state-panel" aria-live="polite">
          <LoaderCircle className="norms-spinner" size={28} aria-hidden="true" />
          <div>
            <h2>Đang mở sổ định mức</h2>
            <p>Hệ thống đang sắp xếp dữ liệu theo từng khoa/phòng…</p>
          </div>
        </section>
      )}

      {loadStatus === 'error' && (
        <section className="norms-state-panel is-error" role="alert">
          <TriangleAlert size={28} aria-hidden="true" />
          <div>
            <h2>Chưa tải được dữ liệu định mức</h2>
            <p>{loadError}</p>
            <button type="button" className="norms-retry-button" onClick={() => setLoadAttempt(value => value + 1)}>
              <RotateCcw size={16} aria-hidden="true" /> Thử tải lại
            </button>
          </div>
        </section>
      )}

      {loadStatus === 'ready' && normsIndex && selectedDepartment && (
        <div className="norms-workspace">
          <aside className="norms-department-panel" aria-labelledby="norms-department-title">
            <div className="norms-department-heading">
              <span className="norms-index-mark" aria-hidden="true">MỤC</span>
              <div>
                <h2 id="norms-department-title">Khoa/phòng</h2>
                <p>Chọn đúng sheet cần tra cứu</p>
              </div>
            </div>

            <div className="norms-department-select">
              <label htmlFor="norms-department">Chọn khoa/phòng</label>
              <select
                id="norms-department"
                value={selectedDepartment.id}
                onChange={event => chooseDepartment(event.target.value)}
              >
                {normsIndex.departments.map(department => (
                  <option key={department.id} value={department.id}>
                    {department.name} — {formatNumber(department.rowCount)} hàng
                  </option>
                ))}
              </select>
            </div>

            <ol className="norms-department-list">
              {normsIndex.departments.map((department, index) => {
                const isActive = department.id === selectedDepartment.id;
                return (
                  <li key={department.id}>
                    <button
                      type="button"
                      className={isActive ? 'is-active' : ''}
                      aria-pressed={isActive}
                      onClick={() => chooseDepartment(department.id)}
                    >
                      <span className="norms-department-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="norms-department-name">{department.name}</span>
                      <span className="norms-department-count">{formatNumber(department.rowCount)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <section className="norms-ledger" aria-labelledby="norms-ledger-title">
            <div className="norms-ledger-heading">
              <div>
                <span className="norms-sheet-label">Sheet · {selectedDepartment.sourceSheet}</span>
                <h2 id="norms-ledger-title">{selectedDepartment.name}</h2>
                <p>Phạm vi dữ liệu gốc: {selectedDepartment.sourceRange || 'Không xác định'}</p>
              </div>
              <div className="norms-ledger-count">
                <strong>{formatNumber(filteredRows.length)}</strong>
                <span>{query ? 'hàng phù hợp' : 'hàng trong sheet'}</span>
              </div>
            </div>

            <div className="norms-toolbar">
              <div className="norms-search-field">
                <label htmlFor="norms-search">Tìm trong khoa/phòng đang chọn</label>
                <div className="norms-search-control">
                  <Search size={18} aria-hidden="true" />
                  <input
                    id="norms-search"
                    type="search"
                    value={query}
                    onChange={event => updateQuery(event.target.value)}
                    placeholder="Tên vật tư, kỹ thuật, đơn vị, số lượng…"
                    autoComplete="off"
                    aria-describedby="norms-search-help"
                  />
                  {query && (
                    <button type="button" onClick={() => updateQuery('')} aria-label="Xóa nội dung tìm kiếm">
                      <X size={17} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <span id="norms-search-help">Có thể nhập không dấu, ví dụ “bang dinh vai”.</span>
              </div>
            </div>

            {selectedDepartment.formulaErrorCount > 0 && (
              <div className="norms-data-warning">
                <TriangleAlert size={18} aria-hidden="true" />
                <p>
                  Sheet này có <strong>{formatNumber(selectedDepartment.formulaErrorCount)}</strong> hàng chứa lỗi công thức từ tệp Excel gốc. Hệ thống giữ nguyên để cán bộ đối chiếu, không tự suy diễn giá trị.
                </p>
              </div>
            )}

            <p className="norms-result-announcement" aria-live="polite">
              {query
                ? `Tìm thấy ${formatNumber(filteredRows.length)} hàng cho “${query}” trong ${selectedDepartment.name}.`
                : `Đang hiển thị dữ liệu của ${selectedDepartment.name}.`}
            </p>

            {filteredRows.length > 0 ? (
              <>
                <div
                  ref={tableFrameRef}
                  className="norms-table-frame"
                  role="region"
                  tabIndex={0}
                  aria-label={`Bảng định mức ${selectedDepartment.name}; có thể cuộn ngang và dọc`}
                >
                  <table className={`norms-table ${selectedDepartment.columns.length <= 5 ? 'is-compact' : ''}`}>
                    <caption>
                      Định mức của {selectedDepartment.name}, các cột được giữ theo vị trí trong tệp Excel gốc.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="norms-row-number-column">Hàng Excel</th>
                        {selectedDepartment.columns.map(column => (
                          <th scope="col" key={column} className={`norms-column-${column.toLowerCase()}`}>
                            Cột {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.items.map(row => (
                        <tr key={row.rowNumber} className={`norms-row-${row.kind}`}>
                          <th scope="row" className="norms-row-number">{row.rowNumber}</th>
                          {selectedDepartment.columns.map(column => {
                            const value = row.cells[column];
                            return (
                              <td
                                key={column}
                                className={`norms-column-${column.toLowerCase()}${column === 'B' ? ' norms-primary-cell' : ''}`}
                              >
                                {value
                                  ? row.hasFormulaError && isNormFormulaError(value)
                                    ? <FormulaErrorValue value={value} />
                                    : value
                                  : <span className="norms-empty-cell" aria-label="Ô trống">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <nav className="norms-pagination" aria-label="Phân trang dữ liệu định mức">
                  <p>
                    Hàng <strong>{formatNumber(paginatedRows.startItem)}–{formatNumber(paginatedRows.endItem)}</strong>
                    {' '}trên {formatNumber(paginatedRows.totalItems)}
                  </p>
                  <div>
                    <button
                      type="button"
                      aria-label="Trang trước"
                      disabled={paginatedRows.page <= 1}
                      onClick={() => goToPage(Math.max(1, paginatedRows.page - 1))}
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <span>Trang <strong>{paginatedRows.page}</strong> / {paginatedRows.pageCount}</span>
                    <button
                      type="button"
                      aria-label="Trang sau"
                      disabled={paginatedRows.page >= paginatedRows.pageCount}
                      onClick={() => goToPage(Math.min(paginatedRows.pageCount, paginatedRows.page + 1))}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                </nav>
              </>
            ) : (
              <div className="norms-empty-result">
                <Search size={25} aria-hidden="true" />
                <h3>Không tìm thấy định mức phù hợp</h3>
                <p>Thử từ khóa ngắn hơn hoặc kiểm tra lại khoa/phòng đang chọn.</p>
                <button type="button" onClick={() => updateQuery('')}>Xóa bộ lọc</button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};

export default NormsLookup;
