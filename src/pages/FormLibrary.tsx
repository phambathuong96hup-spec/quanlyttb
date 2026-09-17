import { useEffect, useState } from 'react';
import { FileText, Download, Upload, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../authContext';
import { downloadForm, formAccept, formCall, formCategories, formFilePayload, listForms, type FormCategory, type FormRecord } from '../services/formLibrary';
import './FormLibrary.css';

export default function FormLibrary() {
 const { role }=useAuth(); const admin=role.toLowerCase()==='admin';
 const [templates,setTemplates]=useState<FormRecord[]>([]); const [submissions,setSubmissions]=useState<FormRecord[]>([]);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [category,setCategory]=useState<FormCategory>('transfer');const [query,setQuery]=useState('');
 const [selected,setSelected]=useState<FormRecord|null>(null);const [title,setTitle]=useState('');const [file,setFile]=useState<File|null>(null);
 const [templateTitle,setTemplateTitle]=useState('');const [templateFile,setTemplateFile]=useState<File|null>(null);const [replace,setReplace]=useState<FormRecord|null>(null);
 const [removing,setRemoving]=useState<FormRecord|null>(null);const [inputKey,setInputKey]=useState(0);
 async function reload() {
  setLoading(true);setError('');
  try {const [a,b]=await Promise.all([listForms('listFormTemplates'),listForms('listSubmittedForms')]);setTemplates(a);setSubmissions(b);}
  catch(e){setError(e instanceof Error?e.message:'Không tải được dữ liệu.');}finally{setLoading(false);}
 }
 useEffect(()=>{void reload();},[]);
 async function perform(operation:()=>Promise<void>) {
  setBusy(true);setError('');setNotice('');try{await operation();}catch(e){setError(e instanceof Error?e.message:'Thao tác thất bại.');}finally{setBusy(false);}
 }
 async function submit(event:React.FormEvent) {
  event.preventDefault();if(!file||!selected)return;
  await perform(async()=>{await formCall('submitForm',{templateId:selected.id,title,...await formFilePayload(file)});setNotice('Đã lưu phiếu của bạn.');setFile(null);setTitle('');setSelected(null);setInputKey(k=>k+1);await reload();});
 }
 async function publish(event:React.FormEvent) {
  event.preventDefault();if(!templateFile)return;
  await perform(async()=>{await formCall('uploadFormTemplate',{title:templateTitle,category,replaceId:replace?.id||'',...await formFilePayload(templateFile)});setNotice(replace?'Đã thay thế mẫu.':'Đã đăng mẫu.');setTemplateFile(null);setTemplateTitle('');setReplace(null);setInputKey(k=>k+1);await reload();});
 }
 const matches=submissions.filter(r=>r.category===category && `${r.title} ${r.senderName} ${r.department}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
 const date=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('vi-VN');};
 return <div className="form-library">
  <header className="fl-heading"><div><span className="fl-eyebrow">HỒ SƠ NGHIỆP VỤ</span><h1>Mẫu và phiếu</h1><p>Tải mẫu của đơn vị, điền thông tin và gửi lại phiếu hoàn thành.</p></div><button disabled={busy||loading} onClick={()=>void reload()}><RefreshCw size={16}/>Tải lại</button></header>
  <div className="fl-categories" aria-label="Loại biểu mẫu">{Object.entries(formCategories).map(([key,label])=><button key={key} aria-pressed={category===key} disabled={busy} onClick={()=>{setCategory(key as FormCategory);setSelected(null);setReplace(null);setTemplateTitle('');}}>{label}</button>)}</div>
  {error&&<div role="alert" className="fl-error">{error}</div>}{notice&&<div role="status" className="fl-notice">{notice}</div>}
  {loading?<p role="status">Đang tải mẫu và phiếu...</p>:<>
  <section className="fl-section"><div className="fl-section-title"><h2>01 / Mẫu {formCategories[category].toLowerCase()}</h2><span>PDF · Word · Excel</span></div>
   <div className="fl-templates">{templates.filter(t=>t.category===category).map(t=><article className="fl-template" key={t.id}>
    <FileText size={26}/><h3>{t.title}</h3><p>{t.fileName}</p><small>Đăng ngày {date(t.createdAt)}</small><div className="fl-actions">
    <button disabled={busy} onClick={()=>void perform(()=>downloadForm('template',t.id))}><Download size={15}/>Tải mẫu</button>
    <button className="fl-primary" disabled={busy} onClick={()=>{setSelected(t);setTitle('');setFile(null);setInputKey(k=>k+1);}}>Sử dụng mẫu</button>
    {admin&&<><button disabled={busy} onClick={()=>{setReplace(t);setTemplateTitle(t.title);setTemplateFile(null);setInputKey(k=>k+1);}}>Thay thế</button><button disabled={busy} aria-label={`Xóa mẫu ${t.title}`} onClick={()=>setRemoving(t)}><Trash2 size={15}/></button></>}
    </div></article>)}</div>
   {!templates.some(t=>t.category===category)&&<p className="fl-empty">Chưa có mẫu cho loại phiếu này. {admin?'Đăng mẫu đầu tiên ở bên dưới.':'Vui lòng chờ admin đăng mẫu.'}</p>}
  </section>
  {removing&&<section className="fl-confirm" role="alert"><p>Xóa mẫu “{removing.title}” khỏi danh sách sử dụng? Các phiếu đã gửi vẫn được giữ lại.</p><button disabled={busy} onClick={()=>void perform(async()=>{await formCall('removeFormTemplate',{id:removing.id});setRemoving(null);setSelected(null);setNotice('Đã xóa mẫu khỏi danh sách sử dụng.');await reload();})}>Xác nhận xóa mẫu</button><button disabled={busy} onClick={()=>setRemoving(null)}>Hủy</button></section>}
  {selected&&<section className="fl-section fl-compose"><h2>Gửi phiếu theo mẫu: {selected.title}</h2><p>Tải mẫu về, điền đầy đủ rồi chọn tệp hoàn thành. Tối đa 8 MB.</p><form onSubmit={submit}>
   <label>Tiêu đề phiếu<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label>
   <label>Phiếu đã điền<input key={`submission-${inputKey}`} required type="file" accept={formAccept} onChange={e=>setFile(e.target.files?.[0]||null)} disabled={busy}/></label>
   <div className="fl-actions"><button className="fl-primary" disabled={busy||!file}><Upload size={16}/>{busy?'Đang xử lý…':'Gửi phiếu'}</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>Hủy</button></div></form></section>}
  {admin&&<details className="fl-section" open={!!replace||undefined}><summary>Quản lý mẫu {formCategories[category].toLowerCase()}</summary><form onSubmit={publish}>
   <h3>{replace?`Thay thế: ${replace.title}`:'Đăng mẫu mới'}</h3><p>Mẫu mới chỉ áp dụng cho phiếu gửi sau này. PDF, DOCX hoặc XLSX, tối đa 8 MB.</p>
   <label>Tên mẫu<input required maxLength={200} value={templateTitle} onChange={e=>setTemplateTitle(e.target.value)} disabled={busy}/></label>
   <label>Tệp mẫu<input key={`template-${inputKey}`} required type="file" accept={formAccept} onChange={e=>setTemplateFile(e.target.files?.[0]||null)} disabled={busy}/></label>
   <div className="fl-actions"><button className="fl-primary" disabled={busy||!templateFile}>{replace?'Lưu mẫu thay thế':'Đăng mẫu'}</button>{replace&&<button type="button" disabled={busy} onClick={()=>{setReplace(null);setTemplateTitle('');}}>Hủy thay thế</button>}</div>
  </form></details>}
  <section className="fl-section"><div className="fl-section-title"><h2>02 / {admin?'Tất cả phiếu đã gửi':'Phiếu tôi đã gửi'}</h2><span>{matches.length} phiếu</span></div><label>Tìm phiếu<input type="search" placeholder={admin?'Tiêu đề, người gửi, khoa/phòng':'Tìm theo tiêu đề'} value={query} onChange={e=>setQuery(e.target.value)}/></label>
   {!matches.length?<p className="fl-empty">Chưa có phiếu phù hợp.</p>:<div className="fl-history">{[...matches].reverse().map(r=><article key={r.id}><div><h3>{r.title}</h3><p>{admin?`${r.senderName} · ${r.department} · `:''}{date(r.createdAt)}</p><small>{r.fileName}</small></div><button disabled={busy} onClick={()=>void perform(()=>downloadForm('submission',r.id))}><Download size={15}/>Tải phiếu</button></article>)}</div>}
  </section></>}
 </div>;
}
