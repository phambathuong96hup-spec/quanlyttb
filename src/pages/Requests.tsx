import React, { Suspense, lazy } from 'react';
import { ClipboardPlus, Repeat2, Wrench } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import './Reports.css';
import './Requests.css';

const RepairRequest = lazy(() => import('./RepairRequest'));
const Transfers = lazy(() => import('./Transfers'));

type RequestType = 'repair' | 'transfer';

const requestTypes: Array<{
  type: RequestType;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    type: 'repair',
    label: 'Báo hỏng / sửa chữa',
    description: 'Tạo yêu cầu kiểm tra, sửa chữa hoặc theo dõi xử lý thiết bị hỏng.',
    icon: Wrench,
  },
  {
    type: 'transfer',
    label: 'Luân chuyển thiết bị',
    description: 'Tạo yêu cầu cho mượn, mượn hoặc trả thiết bị giữa các khoa/phòng.',
    icon: Repeat2,
  },
];

const Requests: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeType: RequestType = searchParams.get('type') === 'transfer' ? 'transfer' : 'repair';

  const selectType = (type: RequestType) => {
    setSearchParams({ type }, { replace: true });
  };

  return (
    <div className={`reports-page request-hub request-hub-${activeType}`}>
      <div className="page-header request-hub-header">
        <div className="request-hub-heading">
          <span className="request-hub-icon" aria-hidden="true">
            <ClipboardPlus size={24} />
          </span>
          <h1 className="page-title">
            Tạo yêu cầu
          </h1>
          <p className="dashboard-subtitle">
            Tạo và theo dõi các yêu cầu nghiệp vụ liên quan đến trang thiết bị.
          </p>
        </div>
      </div>

      <div className="request-type-switch" role="tablist" aria-label="Chọn loại yêu cầu">
        {requestTypes.map(item => {
          const Icon = item.icon;
          const active = activeType === item.type;
          return (
            <button
              key={item.type}
              type="button"
              className={`request-type-card request-type-card-${item.type} ${active ? 'active' : ''}`}
              onClick={() => selectType(item.type)}
              role="tab"
              aria-selected={active}
            >
              <span className="request-type-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="request-type-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          );
        })}
      </div>

      <Suspense fallback={<div className="request-loading">Đang tải biểu mẫu...</div>}>
        {activeType === 'transfer'
          ? <Transfers defaultTab="create" />
          : <RepairRequest defaultTab="create" />}
      </Suspense>
    </div>
  );
};

export default Requests;
