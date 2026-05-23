import React, { useCallback, useState, useEffect } from 'react';
import { type TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Thermometer, Droplets, Plus, RefreshCw, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { Card, CardHeader, CardBody, Button } from '../components/ui';
import { addGspRecord, fetchGspRecords, type GspRecord } from '../services/api';
import { useAuth } from '../authContext';
import { parseFlexibleDate } from '../utils/dateUtils';
import './GspLog.css';

const GSP_LIMITS = {
  tempKho: { min: 15, max: 30 },
  tempTuLanh: { min: 2, max: 8 },
  humidity: { min: 40, max: 75 },
};

const GspLog: React.FC = () => {
  const [records, setRecords] = useState<GspRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'chart' | 'table'>('chart');
  const [chartPeriod, setChartPeriod] = useState(30); // days

  const { name } = useAuth();

  const [form, setForm] = useState({
    shift: 'Sáng',
    tempKho: '',
    tempTuLanh: '',
    humidity: '',
    note: '',
  });

  const fetchGspData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchGspRecords();
      setRecords(data);
    } catch {
      alert('Lỗi tải dữ liệu nhật ký GSP.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGspData();
  }, [fetchGspData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return alert('Vui lòng đăng nhập!');
    setIsSubmitting(true);
    try {
      const result = await addGspRecord({
        ...form,
        tempKho: parseFloat(form.tempKho),
        tempTuLanh: parseFloat(form.tempTuLanh),
        humidity: parseFloat(form.humidity),
        recorder: name,
      });
      if (result.success) {
        alert('✅ Đã ghi nhận thành công!');
        setForm({ shift: 'Sáng', tempKho: '', tempTuLanh: '', humidity: '', note: '' });
        fetchGspData();
      } else {
        alert('❌ Lỗi: ' + result.message);
      }
    } catch {
      alert('Lỗi kết nối mạng!');
    }
    setIsSubmitting(false);
  };

  // Lấy dữ liệu trong khoảng thời gian
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - chartPeriod);
  const filteredRecords = records
    .filter(r => {
      const parsed = parseFlexibleDate(r.date);
      return parsed ? parsed >= cutoff : false;
    })
    .sort((a, b) => {
      const dateA = parseFlexibleDate(a.date)?.getTime() ?? 0;
      const dateB = parseFlexibleDate(b.date)?.getTime() ?? 0;
      return dateA - dateB;
    });

  const labels = filteredRecords.map(r => {
    const d = parseFlexibleDate(r.date);
    if (!d) return `${r.date} ${r.shift}`;
    return `${d.getDate()}/${d.getMonth()+1} ${r.shift}`;
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Nhiệt độ kho (°C)',
        data: filteredRecords.map(r => r.tempKho),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 7,
      },
      {
        label: 'Nhiệt độ tủ lạnh (°C)',
        data: filteredRecords.map(r => r.tempTuLanh),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 7,
      },
      {
        label: 'Độ ẩm kho (%)',
        data: filteredRecords.map(r => r.humidity),
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13, 148, 136, 0.05)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 7,
        yAxisID: 'y1',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => {
            const val = Number(ctx.parsed.y);
            const unit = ctx.datasetIndex === 2 ? '%' : '°C';
            let status = '';
            if (ctx.datasetIndex === 0) {
              status = val < GSP_LIMITS.tempKho.min || val > GSP_LIMITS.tempKho.max ? ' ⚠️ NGOÀI GIỚI HẠN' : ' ✅';
            } else if (ctx.datasetIndex === 1) {
              status = val < GSP_LIMITS.tempTuLanh.min || val > GSP_LIMITS.tempTuLanh.max ? ' ⚠️ NGOÀI GIỚI HẠN' : ' ✅';
            } else {
              status = val < GSP_LIMITS.humidity.min || val > GSP_LIMITS.humidity.max ? ' ⚠️ NGOÀI GIỚI HẠN' : ' ✅';
            }
            return `${ctx.dataset.label}: ${val}${unit}${status}`;
          },
        },
      },
    },
    scales: {
      y: {
        title: { display: true, text: 'Nhiệt độ (°C)' },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      y1: {
        position: 'right' as const,
        title: { display: true, text: 'Độ ẩm (%)' },
        grid: { drawOnChartArea: false },
        min: 0,
        max: 100,
      },
    },
  };

  // Thống kê cảnh báo
  const violations = records.filter(r => {
    return r.tempKho < GSP_LIMITS.tempKho.min || r.tempKho > GSP_LIMITS.tempKho.max ||
           r.tempTuLanh < GSP_LIMITS.tempTuLanh.min || r.tempTuLanh > GSP_LIMITS.tempTuLanh.max ||
           r.humidity < GSP_LIMITS.humidity.min || r.humidity > GSP_LIMITS.humidity.max;
  });

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Nhật ký nhiệt độ / độ ẩm kho (GSP)</h1>
          <p className="dashboard-subtitle">Tiêu chuẩn: Kho thường 15-30°C | Tủ lạnh 2-8°C | Độ ẩm 40-75%</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={fetchGspData}>
          Làm mới
        </Button>
      </div>

      {/* KPI cards */}
      <div className="stats-grid gsp-stats-grid">
        <Card className="stat-card gradient-teal">
          <div className="stat-icon"><Thermometer size={26} /></div>
          <div className="stat-info">
            <span className="stat-value">
              {filteredRecords.length > 0 ? filteredRecords[filteredRecords.length-1].tempKho + '°C' : '--'}
            </span>
            <span className="stat-label">Nhiệt độ kho (mới nhất)</span>
          </div>
        </Card>
        <Card className="stat-card gradient-blue">
          <div className="stat-icon"><Thermometer size={26} /></div>
          <div className="stat-info">
            <span className="stat-value">
              {filteredRecords.length > 0 ? filteredRecords[filteredRecords.length-1].tempTuLanh + '°C' : '--'}
            </span>
            <span className="stat-label">Nhiệt độ tủ lạnh (mới nhất)</span>
          </div>
        </Card>
        <Card className={`stat-card ${violations.length > 0 ? 'gradient-rose' : 'gradient-teal'}`}>
          <div className="stat-icon">
            {violations.length > 0 ? <AlertTriangle size={26} /> : <CheckCircle size={26} />}
          </div>
          <div className="stat-info">
            <span className="stat-value">{violations.length > 0 ? violations.length + ' lần' : 'Đạt'}</span>
            <span className="stat-label">{violations.length > 0 ? 'Vi phạm GSP' : 'Tất cả trong giới hạn'}</span>
          </div>
        </Card>
      </div>

      <div className="gsp-layout">
        {/* Form nhập liệu */}
        <Card>
          <CardHeader title={<div style={{ display:'flex', gap:'8px', alignItems:'center' }}><Plus size={18} /> Ghi nhận ca mới</div>} />
          <CardBody>
            <form onSubmit={handleSubmit} className="gsp-form">
              <div>
                <label className="gsp-form-label">
                  Ca làm việc
                </label>
                <select
                  value={form.shift}
                  onChange={e => setForm({...form, shift: e.target.value})}
                  className="gsp-form-input"
                >
                  <option value="Sáng">☀️ Ca sáng (7h - 11h30)</option>
                  <option value="Chiều">🌇 Ca chiều (13h - 16h30)</option>
                </select>
              </div>

              <div>
                <label className="gsp-form-label">
                  <Thermometer size={14} style={{ marginRight:4 }} />
                  Nhiệt độ kho thường (°C) <span style={{ color: 'var(--warning)', fontSize:'0.7rem' }}>15 - 30°C</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={form.tempKho}
                  onChange={e => setForm({...form, tempKho: e.target.value})}
                  placeholder="VD: 25.5"
                  className="gsp-form-input"
                />
                {form.tempKho && (parseFloat(form.tempKho) < 15 || parseFloat(form.tempKho) > 30) && (
                  <div className="gsp-violation-hint">
                    ⚠️ Ngoài giới hạn GSP! Cần báo cáo ngay.
                  </div>
                )}
              </div>

              <div>
                <label className="gsp-form-label">
                  <Thermometer size={14} style={{ marginRight:4 }} />
                  Nhiệt độ tủ lạnh (°C) <span style={{ color: 'var(--warning)', fontSize:'0.7rem' }}>2 - 8°C</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={form.tempTuLanh}
                  onChange={e => setForm({...form, tempTuLanh: e.target.value})}
                  placeholder="VD: 5.0"
                  className="gsp-form-input"
                />
                {form.tempTuLanh && (parseFloat(form.tempTuLanh) < 2 || parseFloat(form.tempTuLanh) > 8) && (
                  <div className="gsp-violation-hint">
                    ⚠️ Ngoài giới hạn GSP! Tủ lạnh gặp sự cố.
                  </div>
                )}
              </div>

              <div>
                <label className="gsp-form-label">
                  <Droplets size={14} style={{ marginRight:4 }} />
                  Độ ẩm kho (%) <span style={{ color: 'var(--warning)', fontSize:'0.7rem' }}>40 - 75%</span>
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={form.humidity}
                  onChange={e => setForm({...form, humidity: e.target.value})}
                  placeholder="VD: 60"
                  className="gsp-form-input"
                />
                {form.humidity && (parseFloat(form.humidity) < 40 || parseFloat(form.humidity) > 75) && (
                  <div className="gsp-violation-hint">
                    ⚠️ Ngoài giới hạn GSP!
                  </div>
                )}
              </div>

              <div>
                <label className="gsp-form-label">
                  Ghi chú (nếu có)
                </label>
                <textarea
                  value={form.note}
                  onChange={e => setForm({...form, note: e.target.value})}
                  placeholder="Biện pháp xử lý nếu vượt giới hạn..."
                  rows={2}
                  className="gsp-form-input"
                />
              </div>

              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : '💾 Lưu nhật ký'}
              </Button>
            </form>

            <div className="gsp-standards-box">
              <strong>📋 Tiêu chuẩn GSP:</strong>
              <ul>
                <li>Kho thường: <strong>15°C – 30°C</strong></li>
                <li>Tủ lạnh bảo quản: <strong>2°C – 8°C</strong></li>
                <li>Độ ẩm: <strong>40% – 75%</strong></li>
                <li>Ghi chép: <strong>2 lần/ngày</strong> (sáng & chiều)</li>
              </ul>
            </div>
          </CardBody>
        </Card>

        {/* Biểu đồ + Bảng */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card>
            <CardHeader
              title={<div style={{ display:'flex', gap:'8px', alignItems:'center' }}><Calendar size={18} /> Biểu đồ theo dõi dao động</div>}
              action={
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  <select
                    value={chartPeriod}
                    onChange={e => setChartPeriod(parseInt(e.target.value))}
                    className="gsp-period-select"
                  >
                    <option value={7}>7 ngày</option>
                    <option value={14}>14 ngày</option>
                    <option value={30}>30 ngày</option>
                    <option value={60}>60 ngày</option>
                  </select>
                  <div className="gsp-view-toggle">
                    <button
                      onClick={() => setActiveView('chart')}
                      className={activeView === 'chart' ? 'active' : ''}
                    >Biểu đồ</button>
                    <button
                      onClick={() => setActiveView('table')}
                      className={activeView === 'table' ? 'active' : ''}
                    >Bảng</button>
                  </div>
                </div>
              }
            />
            <CardBody>
              {isLoading ? (
                <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>Đang tải dữ liệu...</div>
              ) : filteredRecords.length === 0 ? (
                <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>Chưa có dữ liệu trong {chartPeriod} ngày qua. Hãy bắt đầu ghi chép!</div>
              ) : activeView === 'chart' ? (
                <div className="gsp-chart-container">
                  <Line data={chartData} options={chartOptions} />
                </div>
              ) : (
                <div className="gsp-table-container">
                  <table className="gsp-table">
                    <thead>
                      <tr style={{ background:'var(--bg-secondary)' }}>
                        {['Ngày', 'Ca', 'Kho (°C)', 'Tủ lạnh (°C)', 'Độ ẩm (%)', 'Ghi chú', 'Người ghi'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredRecords].reverse().map((r, i) => {
                        const khoOk = r.tempKho >= 15 && r.tempKho <= 30;
                        const tuLanhOk = r.tempTuLanh >= 2 && r.tempTuLanh <= 8;
                        const humOk = r.humidity >= 40 && r.humidity <= 75;
                        const hasViolation = !khoOk || !tuLanhOk || !humOk;
                        return (
                          <tr key={i} className={hasViolation ? 'has-violation' : ''}>
                            <td>{parseFlexibleDate(r.date)?.toLocaleDateString('vi-VN') || r.date}</td>
                            <td>{r.shift}</td>
                            <td className={!khoOk ? 'violation-value' : ''}>
                              {r.tempKho}°C {!khoOk && '⚠️'}
                            </td>
                            <td className={!tuLanhOk ? 'violation-value' : ''}>
                              {r.tempTuLanh}°C {!tuLanhOk && '⚠️'}
                            </td>
                            <td className={!humOk ? 'violation-value' : ''}>
                              {r.humidity}% {!humOk && '⚠️'}
                            </td>
                            <td className="gsp-note-cell">{r.note || '--'}</td>
                            <td className="gsp-note-cell">{r.recorder || '--'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {violations.length > 0 && (
            <Card>
              <CardHeader title={<div style={{ display:'flex', gap:'8px', alignItems:'center', color:'var(--danger)' }}><AlertTriangle size={18} /> Cảnh báo vi phạm GSP ({violations.length} lần)</div>} />
              <CardBody>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {violations.slice(0, 5).map((r, i) => (
                    <div key={i} className="gsp-violation-card">
                      <strong>{parseFlexibleDate(r.date)?.toLocaleDateString('vi-VN') || r.date} - {r.shift}:</strong>
                      {r.tempKho < 15 || r.tempKho > 30 ? <span style={{ marginLeft:8, color:'var(--danger)' }}>Kho {r.tempKho}°C</span> : null}
                      {r.tempTuLanh < 2 || r.tempTuLanh > 8 ? <span style={{ marginLeft:8, color:'var(--danger)' }}>Tủ lạnh {r.tempTuLanh}°C</span> : null}
                      {r.humidity < 40 || r.humidity > 75 ? <span style={{ marginLeft:8, color:'var(--danger)' }}>Ẩm {r.humidity}%</span> : null}
                      {r.note && <span style={{ marginLeft:8, color:'var(--text-secondary)' }}>— {r.note}</span>}
                    </div>
                  ))}
                  {violations.length > 5 && (
                    <div style={{ textAlign:'center', fontSize:'0.8rem', color:'var(--text-secondary)' }}>... và {violations.length - 5} lần khác</div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default GspLog;
