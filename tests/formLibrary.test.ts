import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function harness() {
 const c=vm.createContext({console}); vm.runInContext(readFileSync('gas/Code.gs','utf8'),c);
 const rows: Record<string, Record<string,unknown>[]>={FormTemplates:[],SubmittedForms:[]};
 c.setupSheets=()=>{}; c.ensureSheet_=()=>{};
 c.requireAuthenticated_=(p: {sessionToken:string})=>p.sessionToken==='admin'?{username:'admin',role:'Admin'}:p.sessionToken==='alice'?{username:'alice',role:'User'}:p.sessionToken==='bob'?{username:'bob',role:'User'}:null;
 c.userUsername_=(a:{username:string})=>a.username; c.userDisplayName_=c.userUsername_; c.userDepartment_=()=> 'Khoa A';
 c.isAdmin_=(a:{role:string})=>a.role==='Admin';
 c.getRows_=(s:string)=>rows[s]||[];
 c.appendObject_=(s:string,r:Record<string,unknown>)=>(rows[s]||=[]).push(r);
 c.withDeviceMutationLock_=(fn:()=>unknown)=>fn(); c.handleIdempotentAction_=(_a:unknown,_p:unknown,_u:unknown,fn:()=>unknown)=>fn();
 c.logActivity_=()=>{};
 let n=0;c.Utilities={getUuid:()=>`id-${++n}`,base64Decode:(v:string)=>Array.from(Buffer.from(v,'base64')),base64Encode:(v:number[])=>Buffer.from(v).toString('base64'),newBlob:()=>({})};
 c.storeFormFile_=()=>({fileId:'drive-private-id'});
 c.formVaultFolder_=()=>({});
 return {c,rows};
}
const file={fileName:'phieu.pdf',fileContent:Buffer.from('%PDF-1.4 test').toString('base64')};
test('form routes reject anonymous and non-admin template upload',()=>{
 const {c}=harness();
 for(const action of ['listFormTemplates','listSubmittedForms','downloadFormFile','uploadFormTemplate','submitForm']) assert.equal(c.route_(action,{}).success,false);
 assert.equal(c.route_('uploadFormTemplate',{...file,category:'repair',title:'Mẫu',sessionToken:'alice'}).success,false);
});
test('admin publishes template and submitted forms belong to authenticated sender only',()=>{
 const {c,rows}=harness();
 const published=c.route_('uploadFormTemplate',{...file,category:'repair',title:'Mẫu sửa chữa',requestId:'r1',sessionToken:'admin'});
 assert.equal(published.success,true);assert.equal(rows.FormTemplates.length,1);
 const templateId=published.id;
 const submitted=c.route_('submitForm',{...file,templateId,title:'Phiếu A',owner:'bob',requestId:'r2',sessionToken:'alice'});
 assert.equal(submitted.success,true);assert.equal(rows.SubmittedForms[0].Owner,'alice');
 assert.equal(c.route_('listSubmittedForms',{sessionToken:'bob',owner:'alice'}).data.length,0);
 assert.equal(c.route_('listSubmittedForms',{sessionToken:'alice'}).data.length,1);
 assert.equal(c.route_('listSubmittedForms',{sessionToken:'admin'}).data.length,1);
 assert.equal(JSON.stringify(c.route_('listSubmittedForms',{sessionToken:'alice'})).includes('drive-private-id'),false);
 let accessed=false;c.DriveApp={getFileById:()=>{accessed=true;return {getBlob:()=>({getBytes:()=>[37,80,68,70]})};}};
 assert.equal(c.route_('downloadFormFile',{kind:'submission',id:submitted.id,sessionToken:'bob'}).success,false);assert.equal(accessed,false);
 assert.equal(c.route_('downloadFormFile',{kind:'submission',id:submitted.id,sessionToken:'alice'}).success,true);
 assert.equal(c.route_('downloadFormFile',{kind:'template',id:templateId,sessionToken:'bob'}).success,true);
});
test('forms reject missing templates, unsafe file content, and missing request IDs',()=>{
 const {c,rows}=harness();
 assert.equal(c.route_('submitForm',{...file,templateId:'absent',requestId:'r',sessionToken:'alice'}).success,false);
 assert.equal(c.route_('uploadFormTemplate',{...file,category:'repair',title:'Mẫu',sessionToken:'admin'}).success,false);
 assert.equal(c.route_('uploadFormTemplate',{...file,fileContent:Buffer.from('<script>bad</script>').toString('base64'),category:'repair',title:'Mẫu',requestId:'r',sessionToken:'admin'}).success,false);
 assert.equal(rows.FormTemplates.length,0);
});
test('admin replaces or retires templates without deleting previously submitted forms',()=>{
 const {c,rows}=harness();
 c.getRowsWithRowIndex_=(sheet:string)=>(rows[sheet]||[]).map((data,i)=>({data,rowIndex:i+2}));
 c.updateRowByObject_=(sheet:string,index:number,value:Record<string,unknown>)=>Object.assign(rows[sheet][index-2],value);
 const first=c.route_('uploadFormTemplate',{...file,category:'purchase',title:'Mẫu mua sắm',requestId:'a',sessionToken:'admin'});
 c.route_('submitForm',{...file,templateId:first.id,title:'Mua máy',requestId:'b',sessionToken:'alice'});
 assert.equal(c.route_('removeFormTemplate',{id:first.id,sessionToken:'alice'}).success,false);
 const next=c.route_('uploadFormTemplate',{...file,category:'purchase',title:'Mẫu mới',replaceId:first.id,requestId:'c',sessionToken:'admin'});
 assert.equal(next.success,true);
 assert.equal(c.route_('listFormTemplates',{sessionToken:'alice'}).data.length,1);
 assert.equal(c.route_('submitForm',{...file,templateId:first.id,title:'Cũ',requestId:'d',sessionToken:'alice'}).success,false);
 assert.equal(rows.SubmittedForms.length,1);
 assert.equal(c.route_('removeFormTemplate',{id:next.id,sessionToken:'admin'}).success,true);
 assert.equal(c.route_('listFormTemplates',{sessionToken:'alice'}).data.length,0);
});
test('form vault rejects group grants and unreadable permission data at any ancestor',()=>{
 const {c}=harness();
 const parent={getId:()=> 'parent',getSharingAccess:()=> 'PRIVATE',getEditors:()=>[],getViewers:()=>[],getParents:()=>({hasNext:()=>false})};
 const folder={...parent,getId:()=> 'folder',getParents:()=>{let read=false;return {hasNext:()=>!read,next:()=>{read=true;return parent;}};}};
 c.DriveApp={Access:{PRIVATE:'PRIVATE'}};
 c.Drive={Permissions:{list:(id:string)=>({permissions:[{type:id==='parent'?'group':'user',role:id==='parent'?'reader':'owner'}]})}};
 assert.throws(()=>c.assertFormVaultPrivate_(folder));
 c.Drive.Permissions.list=()=>({permissions:[{type:'user',role:'owner'}]});assert.doesNotThrow(()=>c.assertFormVaultPrivate_(folder));
 c.Drive.Permissions.list=()=>({});assert.throws(()=>c.assertFormVaultPrivate_(folder));
 c.Drive.Permissions.list=()=>({permissions:[]});assert.throws(()=>c.assertFormVaultPrivate_(folder));
});
test('form recovery finds existing submission by request ID without uploading again',()=>{
 const {c,rows}=harness();rows.SubmittedForms.push({Id:'saved',RequestId:'req',Owner:'alice'});
 assert.equal(c.findBusinessRecordByRequestId_('submitForm','req').id,'saved');
 assert.equal(c.findBusinessRecordByRequestId_('uploadFormTemplate','req'),null);
});
test('repeated form submission uses durable receipt and does not create a second Drive file',()=>{
 const {c,rows}=harness();
 // Load the real idempotency function into this already isolated VM.
 const fresh=vm.createContext({console});vm.runInContext(readFileSync('gas/Code.gs','utf8'),fresh);
 const body=String(fresh.handleIdempotentAction_);vm.runInContext(body,c);
 c.computePayloadHash_=(p:Record<string,unknown>)=>JSON.stringify({...p,sessionToken:undefined});
 c.getRowsWithRowIndex_=(sheet:string)=>(rows[sheet]||[]).map((data,i)=>({data,rowIndex:i+2}));
 c.updateRowByObject_=(sheet:string,index:number,value:Record<string,unknown>)=>Object.assign(rows[sheet][index-2],value);
 let uploads=0;c.storeFormFile_=()=>{uploads++;return {fileId:'private'};};
 rows.FormTemplates.push({Id:'template',Category:'repair',Title:'Mẫu'});
 const payload={...file,templateId:'template',title:'Sửa máy',requestId:'same-id',sessionToken:'alice'};
 const first=c.route_('submitForm',payload);const second=c.route_('submitForm',payload);
 assert.equal(first.success,true);assert.equal(second.id,first.id);assert.equal(second.idempotentReplay,true);
 assert.equal(uploads,1);assert.equal(rows.SubmittedForms.length,1);
});
