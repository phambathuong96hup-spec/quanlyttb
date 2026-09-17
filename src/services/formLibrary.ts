import { postAction } from './api';
export type FormCategory = 'transfer' | 'repair' | 'purchase';
export interface FormRecord { id:string; category:FormCategory; title:string; templateId?:string; owner?:string; senderName?:string; department?:string; createdAt:string; fileName:string; }
export const formCategories: Record<FormCategory,string> = {transfer:'Luân chuyển',repair:'Sửa chữa',purchase:'Mua sắm'};
export const formAccept = '.pdf,.docx,.xlsx';
export async function formCall(action:string,payload:Record<string,unknown>={}) {
 const result=await postAction(action,payload);
 if(!result.success) throw new Error(result.message || 'Không thể thực hiện. Vui lòng thử lại.');
 return result;
}
export async function listForms(action:'listFormTemplates'|'listSubmittedForms'):Promise<FormRecord[]> {
 const result=await formCall(action);
 if(!Array.isArray(result.data)) throw new Error('Dữ liệu danh sách không hợp lệ.');
 return result.data;
}
export async function formFilePayload(file:File) {
 if(!/\.(pdf|docx|xlsx)$/i.test(file.name) || !file.size || file.size>8*1024*1024) throw new Error('Chọn PDF, DOCX hoặc XLSX, tối đa 8 MB.');
 const fileContent=await new Promise<string>((resolve,reject)=>{
 const reader=new FileReader();reader.onerror=()=>reject(new Error('Không đọc được tệp.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
 });
 return {fileName:file.name,fileContent};
}
export async function downloadForm(kind:'template'|'submission',id:string) {
 const result=await formCall('downloadFormFile',{kind,id});
 if(typeof result.fileContent!=='string') throw new Error('Không nhận được nội dung tệp.');
 const bytes=Uint8Array.from(atob(result.fileContent),c=>c.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
 const link=document.createElement('a'); link.href=url;link.download=result.fileName || 'phieu';document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
