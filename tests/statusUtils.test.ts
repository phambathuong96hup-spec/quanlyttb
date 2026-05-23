import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRepairStatusVariant,
  isRepairActive,
  isRepairAwaitingReview,
  isRepairDone,
  isRepairPending,
  isRepairRejected,
} from '../src/utils/statusUtils.ts';

test('repair status helpers treat rejected statuses as terminal even when unaccented or uppercase', () => {
  assert.equal(isRepairRejected('TỪ CHỐI'), true);
  assert.equal(isRepairRejected('TU CHOI'), true);
  assert.equal(isRepairDone('Tu choi'), true);
  assert.equal(isRepairActive('Từ chối'), false);
  assert.equal(getRepairStatusVariant('TU CHOI'), 'danger');
});

test('repair status helpers separate awaiting review from handover and in-progress states', () => {
  assert.equal(isRepairPending('Chờ duyệt'), true);
  assert.equal(isRepairAwaitingReview('Báo hỏng - chờ duyệt'), true);
  assert.equal(isRepairAwaitingReview('Báo hỏng'), true);
  assert.equal(isRepairAwaitingReview('Chua xu ly'), true);
  assert.equal(isRepairAwaitingReview('Chưa duyệt'), true);
  assert.equal(isRepairAwaitingReview('Đã duyệt'), false);
  assert.equal(isRepairPending('Đã sửa xong (Chờ bàn giao)'), false);
  assert.equal(isRepairActive('Đã sửa xong (Chờ bàn giao)'), true);
  assert.equal(isRepairActive('Đã hoàn thành'), false);
});
