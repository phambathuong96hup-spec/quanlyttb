import { test, expect } from '@playwright/test';
test('form library lets a user download an approved template and submit their completed form',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('qlttb.auth',JSON.stringify({username:'alice',role:'User',name:'Alice',token:'qa-token',expiresAt:Date.now()+3600000})));
 let sent=false;
 await page.route('**/macros/s/**/exec*',async route=>{
 const {action,payload}=route.request().postDataJSON();
 let body:unknown={success:true,data:[]};
 if(action==='listFormTemplates') body={success:true,data:[{id:'template',category:'repair',title:'Mẫu sửa chữa chuẩn',fileName:'mau.pdf',createdAt:'2026-09-15'}]};
 if(action==='listSubmittedForms') body={success:true,data:sent?[{id:'submission',category:'repair',title:'Sửa máy thở',fileName:'phieu.pdf',createdAt:'2026-09-15',senderName:'Alice'}]:[]};
 if(action==='submitForm'){expect(payload.templateId).toBe('template');expect(payload.requestId).toBeTruthy();sent=true;body={success:true,id:'submission'};}
 if(action==='downloadFormFile')body={success:true,fileName:'mau.pdf',mimeType:'application/pdf',fileContent:Buffer.from('%PDF-test').toString('base64')};
 await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/forms');
 await expect(page.getByRole('heading',{name:'Mẫu và phiếu'})).toBeVisible();
 await page.getByRole('button',{name:'Sửa chữa',exact:true}).click();
 await expect(page.getByRole('button',{name:'Đăng mẫu'})).toHaveCount(0);
 const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Tải mẫu',exact:true}).click();
 expect((await downloading).suggestedFilename()).toBe('mau.pdf');
 await page.getByRole('button',{name:'Sử dụng mẫu'}).click();
 await page.getByLabel('Tiêu đề phiếu').fill('Sửa máy thở');
 await page.getByLabel('Phiếu đã điền').setInputFiles({name:'phieu.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
 await page.getByRole('button',{name:'Gửi phiếu'}).click();
 await expect(page.getByText('Sửa máy thở',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('admin can replace and delete templates while retaining submitted history',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('qlttb.auth',JSON.stringify({username:'admin',role:'Admin',name:'Admin',token:'qa-token',expiresAt:Date.now()+3600000})));
 let templates=[{id:'old',category:'transfer',title:'Mẫu luân chuyển',fileName:'mau.pdf',createdAt:'2026-09-15'}];
 await page.route('**/macros/s/**/exec*',async route=>{
 const {action,payload}=route.request().postDataJSON();let body:unknown={success:true};
 if(action==='listFormTemplates')body={success:true,data:templates};
 if(action==='listSubmittedForms')body={success:true,data:[{id:'prior',category:'transfer',title:'Phiếu đã gửi trước đó',fileName:'phieu.pdf',senderName:'Người dùng A',department:'Khoa Nhi',createdAt:'2026-09-14'}]};
 if(action==='uploadFormTemplate'){expect(payload.replaceId).toBe('old');templates=[{...templates[0],id:'new',title:payload.title}];}
 if(action==='removeFormTemplate'){expect(payload.id).toBe('new');templates=[];}
 await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/forms');
 await page.getByRole('button',{name:'Thay thế',exact:true}).click();
 await page.getByLabel('Tên mẫu').fill('Mẫu luân chuyển mới');
 await page.getByLabel('Tệp mẫu').setInputFiles({name:'mau.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
 await page.getByRole('button',{name:'Lưu mẫu thay thế'}).click();
 await expect(page.getByRole('heading',{name:'Mẫu luân chuyển mới',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Xóa mẫu Mẫu luân chuyển mới'}).click();
 await page.getByRole('button',{name:'Xác nhận xóa mẫu'}).click();
 await expect(page.getByRole('heading',{name:'Mẫu luân chuyển mới',exact:true})).toHaveCount(0);
 await expect(page.getByText('Phiếu đã gửi trước đó',{exact:true})).toBeVisible();
 await page.screenshot({path:`tmp/forms-admin-${test.info().project.name}.png`,fullPage:true});
});
