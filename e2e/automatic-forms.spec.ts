import { test, expect } from '@playwright/test';

test('automatic forms expose both downloads and recover failed jobs without uploading a completed file',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('qlttb.auth',JSON.stringify({username:'alice',role:'User',name:'Alice',token:'qa-token',expiresAt:Date.now()+3600000})));
 let status='ERROR';
 await page.route('**/macros/s/**/exec*',async route=>{
  const {action,payload}=route.request().postDataJSON();let body:unknown={success:true,data:[]};
  if(action==='listGeneratedForms')body={success:true,data:[{id:'job',category:'repair',title:'Phiếu đề nghị — Máy thở',code:'SC-1',createdAt:'2026-09-28',status,ready:status==='READY',templateTitle:'Mẫu sửa chữa số 1',senderName:'Alice',department:'Khoa Nhi',error:status==='ERROR'?'Xuất PDF lỗi':''}]};
  if(action==='retryGeneratedForm'){expect(payload.id).toBe('job');status='READY';}
  if(action==='downloadGeneratedForm'){expect(['docx','pdf']).toContain(payload.format);body={success:true,fileName:`Phieu-SC-1.${payload.format}`,fileContent:Buffer.from('test').toString('base64')};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/forms?category=repair');
 await expect(page.getByText('Phiếu đề nghị — Máy thở',{exact:true})).toBeVisible();
 await page.screenshot({path:`tmp/forms-workspace-${test.info().project.name}.png`,fullPage:true});
 await expect(page.getByRole('button',{name:'Tải DOCX',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Tạo lại',exact:true}).click();
 for(const format of ['DOCX','PDF']) {
  const download=page.waitForEvent('download');await page.getByRole('button',{name:`Tải ${format}`,exact:true}).click();
  expect((await download).suggestedFilename()).toBe(`Phieu-SC-1.${format.toLowerCase()}`);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`tmp/automatic-forms-${test.info().project.name}.png`,fullPage:true});
});

test('purchase proposal uses the shared request hub and persists a stable request ID',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('qlttb.auth',JSON.stringify({username:'alice',role:'User',name:'Alice',token:'qa-token',expiresAt:Date.now()+3600000})));
 let sent=false;
 await page.route('**/macros/s/**/exec*',async route=>{
  const {action,payload}=route.request().postDataJSON();
  if(action==='createPurchaseRequest'){expect(payload.requestId).toBeTruthy();expect(payload.deviceName).toBe('Máy thở');expect(payload.quantity).toBe(2);expect(payload.owner).toBeUndefined();sent=true;}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,id:'MS-1',data:[]})});
 });
 await page.goto('/requests?type=purchase');
 await page.getByLabel('Tên / loại thiết bị').fill('Máy thở');
 await page.getByLabel('Số lượng',{exact:true}).fill('2');
 await page.getByLabel('Lý do đề nghị').fill('Bổ sung cho khoa');
 await page.getByRole('button',{name:'Gửi đề nghị mua sắm',exact:true}).click();
 await expect(page.getByText(/Đã lưu đề nghị MS-1/)).toBeVisible();expect(sent).toBeTruthy();
});

test('admin previews both formats before explicitly activating an automatic template',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('qlttb.auth',JSON.stringify({username:'admin',role:'Admin',token:'qa-token',expiresAt:Date.now()+3600000})));
 let preview=false,active=false;
 await page.route('**/macros/s/**/exec*',async route=>{
  const {action,payload}=route.request().postDataJSON();let body:unknown={success:true,data:[]};
  if(action==='getAutoFormSettings')body={success:true,data:[{id:'t1',title:'Mẫu sửa chữa',category:'repair',eligible:true,active,preview:preview?{id:'preview:t1',status:'READY',ready:true}:null}]};
  if(action==='previewAutoFormTemplate')preview=true;
  if(action==='activateAutoFormTemplate'){expect(payload.confirmPreview).toBe(true);active=true;}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/forms?category=repair');
 await page.getByText('Mẫu tự điền đang áp dụng',{exact:true}).click();
 await page.getByRole('button',{name:'Tạo bản thử',exact:true}).click();
 await expect(page.getByRole('button',{name:'Kích hoạt mẫu',exact:true})).toBeDisabled();
 await page.getByLabel('Tôi đã kiểm tra bố cục DOCX và PDF').check();
 await page.getByRole('button',{name:'Kích hoạt mẫu',exact:true}).click();
 await expect(page.getByText('Đang dùng tự động',{exact:true})).toBeVisible();
 await page.screenshot({path:`tmp/automatic-template-${test.info().project.name}.png`,fullPage:true});
});
