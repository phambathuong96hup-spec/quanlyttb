import {test,expect} from '@playwright/test';
test('sent license can record renewal against the correct document',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('qlttb.auth',JSON.stringify({username:'qa',role:'Admin',token:'qa',expiresAt:Date.now()+3600000})));
 let saved=false;
 await page.route('**/macros/s/**/exec*',async route=>{
 const method=route.request().method(); const req=method==='GET'?{action:new URL(route.request().url()).searchParams.get('action'),payload:{}}:route.request().postDataJSON();
 const devices=[{id:'QA-RENEW','Tên Thiết bị':'Máy kiểm thử gia hạn','Seri Máy':'QA-RENEW',documents:[{DocumentId:'LICENSE-1','Loại tài liệu':'Giấy phép','Hạn đăng kiểm / Hạn hiệu lực':'27/06/2026','Trạng thái Hồ sơ':'Đã gửi'}]}];
 let body:unknown={success:true,data:[]};
 if(req.action==='getDevices')body=method==='GET'?devices:{success:true,data:devices};
 if(req.action==='renewDocument'){expect(req.payload.documentId).toBe('LICENSE-1');expect(req.payload.docType).toBe('Giấy phép');expect(req.payload.expiryDate).toBe('29/09/2027');saved=true;body={success:true,message:'Đã ghi nhận gia hạn thử'};}
 await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/devices/QA-RENEW');
 await page.getByRole('tab',{name:/Tài liệu kiểm định/}).click();
 await page.getByRole('button',{name:'Cập nhật kết quả gia hạn',exact:true}).click();
 await page.getByLabel('Hạn đăng kiểm / hạn hiệu lực',{exact:false}).fill('2027-09-29');
 await page.getByRole('button',{name:'Xác nhận gia hạn',exact:true}).click();
 await expect(page.getByText('Đã ghi nhận gia hạn thử',{exact:true})).toBeVisible();
 expect(saved).toBeTruthy();
});
