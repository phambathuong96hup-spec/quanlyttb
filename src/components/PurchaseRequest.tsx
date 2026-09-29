import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formCall } from '../services/formLibrary';
import '../pages/FormLibrary.css';

export default function PurchaseRequest() {
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState('');
 const [fields,setFields]=useState({deviceName:'',quantity:'1',unit:'cái',description:'',specification:'',estimatedCost:'',fundingSource:''});
 async function submit(event:React.FormEvent) {
  event.preventDefault();setBusy(true);setError('');setSaved('');
  try {const result=await formCall('createPurchaseRequest',{...fields,quantity:Number(fields.quantity)});setSaved(String(result.id));}
  catch(e){setError(e instanceof Error?e.message:'Không gửi được đề nghị.');}finally{setBusy(false);}
 }
 return <div className="form-library"><section className="fl-section"><h2>Đề nghị mua sắm</h2>
  <p>Người lập và khoa/phòng được lấy từ tài khoản của bạn. Phiếu DOCX/PDF sẽ được tạo từ mẫu Admin sau khi lưu đề nghị.</p>
  {error&&<p role="alert" className="fl-error">{error}</p>}
  {saved?<div role="status" className="fl-notice"><p>Đã lưu đề nghị {saved}. Phiếu đang chờ xử lý.</p><Link to="/forms?category=purchase">Xem và tải DOCX / PDF</Link><div className="fl-actions"><button type="button" onClick={()=>{setSaved('');setFields({deviceName:'',quantity:'1',unit:'cái',description:'',specification:'',estimatedCost:'',fundingSource:''});}}>Lập đề nghị khác</button></div></div>:<form onSubmit={submit}>
   <label>Tên / loại thiết bị<input required maxLength={200} value={fields.deviceName} disabled={busy} onChange={e=>setFields({...fields,deviceName:e.target.value})}/></label>
   <div className="fl-purchase-grid"><label>Số lượng<input type="number" required min={1} max={100000} step={1} value={fields.quantity} disabled={busy} onChange={e=>setFields({...fields,quantity:e.target.value})}/></label>
   <label>Đơn vị tính<input required maxLength={30} value={fields.unit} disabled={busy} onChange={e=>setFields({...fields,unit:e.target.value})}/></label></div>
   <label>Lý do đề nghị<textarea required rows={4} maxLength={10000} value={fields.description} disabled={busy} onChange={e=>setFields({...fields,description:e.target.value})}/></label>
   <label>Yêu cầu kỹ thuật<textarea rows={3} maxLength={10000} value={fields.specification} disabled={busy} onChange={e=>setFields({...fields,specification:e.target.value})}/></label>
   <label>Dự toán (nếu có)<input maxLength={100} value={fields.estimatedCost} disabled={busy} onChange={e=>setFields({...fields,estimatedCost:e.target.value})}/></label>
   <label>Nguồn kinh phí (nếu có)<input maxLength={500} value={fields.fundingSource} disabled={busy} onChange={e=>setFields({...fields,fundingSource:e.target.value})}/></label>
   <button className="fl-primary" disabled={busy}>{busy?'Đang gửi…':'Gửi đề nghị mua sắm'}</button>
  </form>}
 </section></div>;
}
