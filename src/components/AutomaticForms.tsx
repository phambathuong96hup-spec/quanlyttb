import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useAuth } from '../authContext';
import { downloadGeneratedForm, formCall, generatedFormStatus, type AutoFormSetting, type FormCategory, type GeneratedForm } from '../services/formLibrary';

export default function AutomaticForms({ category }: { category:FormCategory }) {
 const {role}=useAuth(); const admin=role.toLowerCase()==='admin';
 const [jobs,setJobs]=useState<GeneratedForm[]>([]);
 const [settings,setSettings]=useState<AutoFormSetting[]>([]);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);const [checked,setChecked]=useState<Record<string,boolean>>({});
 const load=useCallback(async()=>{
  const [forms,templates]=await Promise.all([formCall('listGeneratedForms'),admin?formCall('getAutoFormSettings'):Promise.resolve({data:[]})]);
  if(!Array.isArray(forms.data)||!Array.isArray(templates.data))throw new Error('Chưa tải được dữ liệu phiếu tự động.');
  setJobs(forms.data);setSettings(templates.data);
 },[admin]);
 useEffect(()=>{let current=true;void load().catch(e=>{if(current)setError(e instanceof Error?e.message:'Không tải được phiếu.');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[load]);
 async function perform(operation:()=>Promise<unknown>,reload=true) {
  setBusy(true);setError('');setNotice('');
  try {await operation();if(reload)await load();} catch(e){setError(e instanceof Error?e.message:'Thao tác thất bại.');}finally{setBusy(false);}
 }
 const filtered=jobs.filter(j=>j.category===category);
 const downloadButtons=(job:GeneratedForm,preview=false)=><div className="fl-actions">
  {(['docx','pdf'] as const).map(format=><button type="button" key={format} disabled={busy} onClick={()=>void perform(()=>downloadGeneratedForm(job.id,format),false)}><Download size={15}/>{preview?'Bản thử ': 'Tải '}{format.toUpperCase()}</button>)}
 </div>;
 return <section className="fl-section fl-auto" aria-label="Phiếu tự động">
  <div className="fl-section-title"><h2>Phiếu tự động · DOCX / PDF</h2><button type="button" disabled={busy||loading} onClick={()=>void perform(load,false)}><RefreshCw size={15}/>Cập nhật phiếu</button></div>
  <p>Phiếu được tạo từ dữ liệu yêu cầu đã gửi và lưu riêng tư trên Google Drive. {admin?'Bạn có thể xem tất cả phiếu.':'Bạn chỉ xem và tải phiếu do mình lập.'}</p>
  {error&&<p className="fl-error" role="alert">{error}</p>}{notice&&<p className="fl-notice" role="status">{notice}</p>}
  {loading?<p role="status">Đang tải phiếu tự động…</p>:filtered.length===0?<p className="fl-empty">Chưa có phiếu tự động cho loại yêu cầu này.</p>:<div className="fl-history">{[...filtered].reverse().map(job=><article key={job.id}>
   <div><h3>{job.title}</h3><p>{job.code} · {job.senderName} · {job.department}</p><small>{job.templateTitle} · {new Date(job.createdAt).toLocaleString('vi-VN')}</small>
    <p className={`fl-job-status fl-job-${job.status.toLowerCase()}`}>{generatedFormStatus[job.status]||job.status}</p>{job.error&&<p>{job.error}</p>}
   </div>
   {job.ready?downloadButtons(job):<div>{['ERROR','BLOCKED_TEMPLATE','PROCESSING'].includes(job.status)&&<button type="button" disabled={busy} onClick={()=>void perform(async()=>{await formCall('retryGeneratedForm',{id:job.id});setNotice('Đã yêu cầu tạo lại phiếu. Bấm Cập nhật phiếu để kiểm tra kết quả.');})}>Tạo lại</button>}</div>}
  </article>)}</div>}
  {admin&&<details className="fl-auto-settings"><summary>Mẫu tự điền đang áp dụng</summary>
   <p>Chọn DOCX đã đăng trong thư viện. Tạo bản thử, kiểm tra cả hai tệp rồi kích hoạt cho yêu cầu mới. Thay mẫu không đổi phiếu cũ.</p>
   {!settings.some(s=>s.category===category&&s.eligible)&&<p>Chưa có mẫu DOCX phù hợp. Đăng mẫu có trường đánh dấu ở phần Quản lý mẫu bên dưới.</p>}
   {settings.filter(s=>s.category===category&&s.eligible).map(setting=><div className="fl-template" key={setting.id}>
    <h3>{setting.title}</h3>{setting.active&&<p className="fl-notice">Đang dùng tự động</p>}
    {setting.preview?<><p>{generatedFormStatus[setting.preview.status]}</p>{setting.preview.error&&<p role="alert">{setting.preview.error}</p>}
     {setting.preview.ready?downloadButtons(setting.preview,true):<button type="button" disabled={busy||setting.preview.status==='PROCESSING'||setting.preview.status==='PENDING'} onClick={()=>void perform(()=>formCall('retryGeneratedForm',{id:setting.preview!.id}))}>Tạo lại bản thử</button>}
    </>:<button type="button" disabled={busy} onClick={()=>void perform(()=>formCall('previewAutoFormTemplate',{id:setting.id}))}>Tạo bản thử</button>}
    {!setting.active&&setting.preview?.ready&&<><label className="fl-checkbox"><input type="checkbox" checked={!!checked[setting.id]} onChange={e=>setChecked({...checked,[setting.id]:e.target.checked})}/>Tôi đã kiểm tra bố cục DOCX và PDF</label>
     <button type="button" className="fl-primary" disabled={busy||!checked[setting.id]} onClick={()=>void perform(()=>formCall('activateAutoFormTemplate',{id:setting.id,confirmPreview:true}))}>Kích hoạt mẫu</button></>}
   </div>)}
   <p className="fl-help">Mẫu tự điền tối đa 5 MB. Trường bắt buộc: <code>{'{{request.code}}, {{request.date}}, {{requester.name}}, {{department.name}}, {{device.name}}, {{request.description}}'}</code>. Luân chuyển cần thêm khoa giao/nhận; mua sắm cần số lượng/đơn vị tính. Tác vụ nền cần được quản trị hệ thống cài đặt trước.</p>
  </details>}
 </section>;
}
