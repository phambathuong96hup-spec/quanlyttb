import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function harness() {
 const c = vm.createContext({console});
 vm.runInContext(readFileSync('gas/Code.gs','utf8'),c);
 const rows: Record<string, Record<string,unknown>[]> = {Repairs:[], Transfers:[], PurchaseRequests:[], GeneratedForms:[], FormTemplates:[]};
 const props = new Map<string,string>(); let uuid=0;
 c.PropertiesService={getScriptProperties:()=>({getProperty:(k:string)=>props.get(k)||null,setProperty:(k:string,v:string)=>props.set(k,v),deleteProperty:(k:string)=>props.delete(k)})};
 c.Utilities={getUuid:()=>`uuid-${++uuid}`,formatDate:()=> '28/09/2026',base64Encode:(v:number[])=>Buffer.from(v).toString('base64')};
 c.Session={getScriptTimeZone:()=> 'Asia/Bangkok'};
 c.ensureSheet_=()=>{}; c.ensureSchemaVersion_=()=>true;
 c.withDeviceMutationLock_=(fn:()=>unknown)=>fn();
 c.getRows_=(s:string)=>rows[s]||[];
 c.getRowsWithRowIndex_=(s:string)=>(rows[s]||[]).map((data,i)=>({data,rowIndex:i+2}));
 c.appendObject_=(s:string,r:Record<string,unknown>)=>(rows[s]||=[]).push({...r});
 c.updateRowByObject_=(s:string,i:number,r:Record<string,unknown>)=>Object.assign(rows[s][i-2],r);
 c.requireAuthenticated_=(p:{sessionToken:string})=> ['alice','bob','admin'].includes(p.sessionToken)?{username:p.sessionToken,role:p.sessionToken==='admin'?'Admin':'User',name:p.sessionToken,department:'Khoa Nhi'}:null;
 c.userUsername_=(a:{username:string})=>a.username;
 c.userDisplayName_=(a:{name:string})=>a.name;
 c.userDepartment_=(a:{department:string})=>a.department;
 c.isAdmin_=(a:{role:string})=>a.role==='Admin';
 const actor={username:'alice',name:'Nguyễn Thị Ánh',department:'Khoa Nhi'};
 const template={Id:'t1',FileId:'private-template',Category:'repair',Title:'Mẫu chuẩn',MimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',Active:'true'};
 rows.FormTemplates.push(template);
 props.set('AUTO_FORM_TEMPLATE_repair',JSON.stringify({id:'t1',fileId:'private-template',title:'Mẫu chuẩn'}));
 function source(id='r1') {
  const snapshot=c.autoFormSnapshot_('repair',id,actor,{id:'TB1','Tên Thiết bị':'Máy thở','Seri Máy':'S1','Nơi đặt thiết bị':'Khoa Nhi'},{description:'Không khởi động'},new Date());
  rows.Repairs.push({RequestId:id,FormSnapshot:snapshot}); return JSON.parse(snapshot);
 }
 return {c,rows,props,actor,source};
}

test('automatic forms snapshot equipment, authenticated identity and immutable template version',()=>{
 const {c,source,props}=harness();
 assert.equal(typeof c.autoFormSnapshot_,'function','missing automatic snapshot implementation');
 const s=source(); props.set('AUTO_FORM_TEMPLATE_repair',JSON.stringify({id:'t2'}));
 assert.equal(s.owner,'alice'); assert.equal(s.values['requester.name'],'Nguyễn Thị Ánh');
 assert.equal(s.values['device.serial'],'S1'); assert.equal(s.template.id,'t1');
 assert.equal(s.values['request.code'],'r1');
});

test('discovery is durable, ignores legacy requests and deduplicates full IDs',()=>{
 const {c,rows,source}=harness();
 assert.equal(typeof c.discoverAutomaticForms_,'function');
 source('same/a'); source('same_a'); rows.Repairs.push({RequestId:'legacy'});
 c.discoverAutomaticForms_(); c.discoverAutomaticForms_();
 assert.equal(rows.GeneratedForms.length,2);
 assert.notEqual(rows.GeneratedForms[0].Id,rows.GeneratedForms[1].Id);
});

test('list/download/retry enforce ownership and never reveal Drive IDs or snapshots',()=>{
 const {c,rows,source}=harness();
 assert.equal(typeof c.autoFormRoute_,'function'); source(); c.discoverAutomaticForms_();
 const row=rows.GeneratedForms[0]; Object.assign(row,{Status:'READY',DocxId:'secret-docx',PdfId:'secret-pdf'});
 let touched=false;c.DriveApp={getFileById:()=>{touched=true;return {getBlob:()=>({getBytes:()=>[37,80,68,70]})};}};
 assert.equal(c.route_('listGeneratedForms',{sessionToken:'bob'}).data.length,0);
 for(const action of ['downloadGeneratedForm','retryGeneratedForm']) {
  assert.equal(c.route_(action,{sessionToken:'bob',id:row.Id,format:'pdf'}).success,false);
  assert.equal(c.route_(action,{id:row.Id,format:'pdf'}).success,false);
 }
 assert.equal(touched,false);
 const own=c.route_('listGeneratedForms',{sessionToken:'alice'});
 assert.equal(own.data.length,1); assert.equal(JSON.stringify(own).includes('secret-'),false);
 assert.equal(JSON.stringify(own).includes('Không khởi động'),false);
 assert.equal(c.route_('listGeneratedForms',{sessionToken:'admin'}).data.length,1);
 assert.equal(c.route_('downloadGeneratedForm',{sessionToken:'alice',id:row.Id,format:'exe'}).success,false);
 assert.equal(c.route_('downloadGeneratedForm',{sessionToken:'alice',id:row.Id,format:'pdf'}).success,true);
});

test('worker publishes only a complete pair, retries failures, and cannot claim a live lease',()=>{
 const {c,rows,source}=harness(); assert.equal(typeof c.claimAutomaticForm_,'function'); source();c.discoverAutomaticForms_();
 const first=c.claimAutomaticForm_(); assert.ok(first); assert.equal(c.claimAutomaticForm_(),null);
 assert.equal(c.finishAutomaticForm_(first,{docxId:'d'},null),false);
 assert.notEqual(rows.GeneratedForms[0].Status,'READY');
 c.finishAutomaticForm_(first,null,new Error('export failed'));
 assert.equal(rows.GeneratedForms[0].Status,'ERROR');
 const second=c.claimAutomaticForm_(); assert.ok(second);
 assert.equal(c.finishAutomaticForm_(first,{docxId:'stale',pdfId:'stale'},null),false);
 assert.equal(c.finishAutomaticForm_(second,{docxId:'d',pdfId:'p'},null),true);
 assert.equal(rows.GeneratedForms[0].Status,'READY');assert.equal(c.claimAutomaticForm_(),null);
});

test('expired leases recover and automatic attempts stop at three',()=>{
 const {c,rows,source}=harness(); assert.equal(typeof c.claimAutomaticForm_,'function');source();c.discoverAutomaticForms_();
 c.claimAutomaticForm_(); rows.GeneratedForms[0].LeaseUntil=new Date(0).toISOString();
 const recovered=c.claimAutomaticForm_();assert.ok(recovered);
 c.finishAutomaticForm_(recovered,null,new Error('failed'));
 const third=c.claimAutomaticForm_(); c.finishAutomaticForm_(third,null,new Error('failed'));
 assert.equal(c.claimAutomaticForm_(),null);
});

test('missing template remains recoverable without recreating the business request',()=>{
 const {c,props,rows,source}=harness(); assert.equal(typeof c.autoFormSnapshot_,'function');
 props.delete('AUTO_FORM_TEMPLATE_repair');source();c.discoverAutomaticForms_();
 assert.equal(rows.GeneratedForms[0].Status,'BLOCKED_TEMPLATE');
 assert.equal(c.claimAutomaticForm_(),null);
 props.set('AUTO_FORM_TEMPLATE_repair',JSON.stringify({id:'t1',fileId:'private-template',title:'Mẫu chuẩn'}));
 assert.equal(c.route_('retryGeneratedForm',{sessionToken:'alice',id:rows.GeneratedForms[0].Id}).success,true);
 assert.equal(rows.GeneratedForms.length,1);assert.equal(rows.Repairs.length,1);
 assert.equal(JSON.parse(String(rows.GeneratedForms[0].Snapshot)).template.id,'t1');
});

test('purchase creates one persisted request with server identity across retries',()=>{
 const {c,rows}=harness();assert.equal(typeof c.autoFormRoute_,'function');
 const p={sessionToken:'alice',requestId:'buy-1',deviceName:'Máy thở',quantity:2,unit:'cái',description:'Bổ sung',owner:'bob',department:'Fake'};
 const a=c.route_('createPurchaseRequest',p);const b=c.route_('createPurchaseRequest',p);
 assert.equal(a.success,true);assert.equal(b.id,a.id);assert.equal(rows.PurchaseRequests.length,1);
 const snap=JSON.parse(String(rows.PurchaseRequests[0].FormSnapshot));assert.equal(snap.owner,'alice');assert.equal(snap.values['department.name'],'Khoa Nhi');
 assert.equal(c.route_('createPurchaseRequest',{...p,requestId:'bad',quantity:0}).success,false);
});

test('template token validator rejects unknown or missing required fields',()=>{
 const {c}=harness();assert.equal(typeof c.validateAutoFormTokens_,'function');
 const tokens='{{request.code}} {{request.date}} {{requester.name}} {{department.name}} {{device.name}} {{request.description}}';
 assert.doesNotThrow(()=>c.validateAutoFormTokens_(tokens,'repair'));
 assert.throws(()=>c.validateAutoFormTokens_(tokens+' {{device.password}}','repair'),/device.password/);
 assert.throws(()=>c.validateAutoFormTokens_('{{request.code}}','repair'),/request.date/);
});

test('inactive templates cannot be selected for new requests while an existing snapshot is retained',()=>{
 const {c,rows,source}=harness();const old=source();rows.FormTemplates[0].Active='FALSE';
 assert.equal(JSON.parse(c.autoFormSnapshot_('repair','new',{username:'alice'}, {}, {},new Date())).template,null);
 assert.equal(old.template.id,'t1');
});

test('denied worker locks never start a render or publish a result',()=>{
 const {c,rows,source}=harness();source();c.discoverAutomaticForms_();
 c.withDeviceMutationLock_=()=>({success:false,message:'busy'});
 assert.equal(c.claimAutomaticForm_(),null);
 assert.equal(c.finishAutomaticForm_({Id:rows.GeneratedForms[0].Id,RunId:'bad'},{docxId:'d',pdfId:'p'},null),false);
 assert.equal(rows.GeneratedForms[0].Status,'PENDING');
});

test('literal replacement preserves dollar, backslash and token-like user text',()=>{
 const {c}=harness(); let value='{{request.description}} / {{device.name}}';
 const text={getText:()=>value,getAttributes:()=>({bold:true}),deleteText:(a:number,b:number)=>{value=value.slice(0,a)+value.slice(b+1);},insertText:(a:number,s:string)=>{value=value.slice(0,a)+s+value.slice(a);},setAttributes:()=>{}};
 c.fillAutoFormSection_({editAsText:()=>text},{'request.description':'$1 \\ {{device.name}}','device.name':'Máy thở'});
 assert.equal(value,'$1 \\ {{device.name}} / Máy thở');
});

test('preview activation is admin-only and requires a complete preview plus acknowledgement',()=>{
 const {c,props}=harness();props.delete('AUTO_FORM_TEMPLATE_repair');
 assert.equal(c.route_('previewAutoFormTemplate',{sessionToken:'alice',id:'t1'}).success,false);
 assert.equal(c.route_('activateAutoFormTemplate',{sessionToken:'admin',id:'t1',confirmPreview:true}).success,false);
 c.route_('previewAutoFormTemplate',{sessionToken:'admin',id:'t1'});
 const job=c.claimAutomaticForm_();assert.equal(job.Kind,'preview');
 c.finishAutomaticForm_(job,{docxId:'d',pdfId:'p'},null);
 assert.equal(c.route_('activateAutoFormTemplate',{sessionToken:'admin',id:'t1'}).success,false);
 assert.equal(c.route_('activateAutoFormTemplate',{sessionToken:'admin',id:'t1',confirmPreview:true}).success,true);
 assert.ok(props.get('AUTO_FORM_TEMPLATE_repair'));
});

test('purchase rejects reusing a request ID for different content',()=>{
 const {c,rows}=harness();const p={sessionToken:'alice',requestId:'buy-once',deviceName:'Máy thở',quantity:2,unit:'cái',description:'Bổ sung'};
 assert.equal(c.route_('createPurchaseRequest',p).success,true);
 assert.equal(c.route_('createPurchaseRequest',{...p,quantity:3}).success,false);
 assert.equal(rows.PurchaseRequests.length,1);
});

test('renderer saves both private formats and discards partial output on PDF failure',()=>{
 for(const fail of [false,true]) {
  const {c,source}=harness();const snapshot=source();const trash:string[]=[];const names:string[]=[];
  const blob={setContentType:()=>blob,setName:(s:string)=>{names.push(s);return blob;}};
  c.formVaultFolder_=()=>({getId:()=> 'vault',createFile:()=>{const id='out-'+names.length;return {getId:()=>id,setTrashed:()=>trash.push(id)};}});
  c.DriveApp={getFileById:(id:string)=>({getBlob:()=>blob,getSize:()=>100,setTrashed:()=>trash.push(id)})};
  c.Drive={Files:{create:(metadata:{parents:string[]},input:unknown)=>{assert.deepEqual(Array.from(metadata.parents),['vault']);assert.equal(input,blob);return {id:'converted'};}}};
  const section={getText:()=> '{{request.code}} {{request.date}} {{requester.name}} {{department.name}} {{device.name}} {{request.description}}'};
  c.DocumentApp={openById:()=>({getBody:()=>section,getHeader:()=>null,getFooter:()=>null,saveAndClose:()=>{}})};
  c.assertFormVaultPrivate_=()=>{};c.fillAutoFormSection_=()=>{};
  c.exportAutomaticBlob_=(_id:string,format:string)=>{if(fail&&format==='pdf')throw new Error('PDF failed');return blob;};
  const call=()=>c.renderAutomaticForm_({Snapshot:JSON.stringify(snapshot),RunId:'run1'});
  if(fail){assert.throws(call,/PDF failed/);assert.ok(trash.includes('out-1'));}
  else {const files=call();assert.equal(files.docxId,'out-1');assert.equal(files.pdfId,'out-2');assert.equal(trash.includes('out-1'),false);}
  assert.ok(trash.includes('converted'));
 }
});

test('missing required request data is never presented as a completed proposal',()=>{
 const {c,source}=harness();const s=source();s.values['department.name']='';
 assert.equal(typeof c.validateAutoFormValues_,'function');
 assert.throws(()=>c.validateAutoFormValues_(s),/khoa\/phòng/i);
});

test('automatic snapshots use the equipment unit and tolerate a broken template setting',()=>{
 const {c,actor,props}=harness();props.set('AUTO_FORM_TEMPLATE_repair','not-json');
 assert.doesNotThrow(()=>c.autoFormSnapshot_('repair','r',actor,{'Đơn vị tính':'bộ'},{description:'Hỏng'},new Date()));
 const s=JSON.parse(c.autoFormSnapshot_('repair','r',actor,{'Đơn vị tính':'bộ'},{description:'Hỏng'},new Date()));
 assert.equal(s.values['request.unit'],'bộ');assert.equal(s.template,null);
});

test('repair and transfer creation persist the snapshot in the same business write',()=>{
 const {c,rows,actor}=harness();let repair:Record<string,unknown>|undefined;
 c.uploadEvidenceFilesToDrive_=()=>({files:[],failures:[]});
 c.findDeviceById_=()=>({id:'TB1','Tên Thiết bị':'Máy thở','Seri Máy':'S1'});
 c.appendRepairAndGetRowId_=(r:Record<string,unknown>)=>{repair=r;return 'time';};
 c.findDeviceWithRowIndex_=()=>({rowIndex:2,device:{id:'TB1'}});
 c.appendObjectAndGetRowIndex_=()=>2;c.syncDeviceStatusForDevice_=()=>{};c.logActivity_=()=>{};c.enqueueEmailNotification_=()=>({queued:true});c.adminEmails_=()=>[];c.getDeviceRecipients_=()=>[];
 c.updateRowByObject_=()=>{};
 c.reportRepair_({deviceId:'TB1',requestId:'repair-atomic',description:'Hỏng'},actor);
 assert.ok(repair);assert.equal(JSON.parse(String(repair!.FormSnapshot)).code,'repair-atomic');
 c.findUser_=()=>actor;c.findDeviceRow_=()=>2;c.rowObject_=()=>({id:'TB1','Tên Thiết bị':'Máy thở','Nơi đặt thiết bị':'Khoa Nhi'});
 c.uploadImageToDrive_=()=>'';c.nextTransferId_=()=> 'LC-1';c.sendTransferMail_=()=>{};
 assert.equal(c.createTransfer_({deviceId:'TB1',toDepartment:'Khoa A',requestId:'transfer-atomic',actorUsername:'alice'}).success,true);
 assert.equal(JSON.parse(String(rows.Transfers[0].FormSnapshot)).values['transfer.to'],'Khoa A');
});
