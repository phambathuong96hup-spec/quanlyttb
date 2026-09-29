import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canRenewDocument } from '../src/utils/documentWorkflow.ts';

test('licenses and radiation certificates with expiry can be renewed after sending', () => {
 for (const docType of ['Giấy phép','An toàn bức xạ','Kiểm định']) {
  assert.equal(canRenewDocument({docType,expiryDate:'27/06/2026',status:'Đã gửi'}),true);
 }
 assert.equal(canRenewDocument({docType:'Giấy phép',expiryDate:'27/06/2026',status:'Đã gia hạn'}),false);
 assert.equal(canRenewDocument({docType:'Hướng dẫn sử dụng',expiryDate:'',status:''}),false);
 assert.equal(canRenewDocument({docType:'Đăng kiểm',expiryDate:'',status:'Chưa gửi'}),true);
});
