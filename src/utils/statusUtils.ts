/**
 * Centralized status utilities for the Equipment Management app.
 * Consolidates repair and transfer status logic and defines type-safe enums/constants.
 */

import type { BadgeVariant } from '../components/ui';
import { removeVietnameseTones } from './stringUtils.ts';

// ──────────────────────────────────────────────────
// Repair Status
// ──────────────────────────────────────────────────

export const REPAIR_STATUS = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CHECKING: 'Đang kiểm tra',
  REPAIRING: 'Đang sửa chữa',
  FIXED: 'Đã sửa xong',
  COMPLETED: 'Đã hoàn thành',
} as const;

export type RepairStatus = typeof REPAIR_STATUS[keyof typeof REPAIR_STATUS];

/** Human-readable labels for repair statuses. */
export const repairStatusText: Record<string, string> = {
  [REPAIR_STATUS.PENDING]: 'Chờ duyệt',
  [REPAIR_STATUS.APPROVED]: 'Đã duyệt',
  [REPAIR_STATUS.REJECTED]: 'Từ chối',
  [REPAIR_STATUS.CHECKING]: 'Đang kiểm tra',
  [REPAIR_STATUS.REPAIRING]: 'Đang sửa chữa',
  [REPAIR_STATUS.FIXED]: 'Đã sửa xong',
  [REPAIR_STATUS.COMPLETED]: 'Đã hoàn thành',
};

export const normalizeRepairStatus = (status: string): string =>
  removeVietnameseTones(String(status || '').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();

export const isRepairRejected = (status: string): boolean => {
  const s = normalizeRepairStatus(status);
  return s.includes('tu choi') || s.includes('khong dong y');
};

/** Check if a repair status indicates the repair is completed. */
export const isRepairCompleted = (status: string): boolean => {
  const s = normalizeRepairStatus(status);
  return s.includes('hoan thanh') || s.includes('da xu ly');
};

export const isRepairAwaitingHandover = (status: string): boolean => {
  const s = normalizeRepairStatus(status);
  return s.includes('cho ban giao') || s.includes('sua xong');
};

export const isRepairAwaitingReview = (status: string): boolean => {
  const s = normalizeRepairStatus(status);
  if (isRepairRejected(status) || isRepairCompleted(status) || isRepairAwaitingHandover(status)) return false;
  return s.includes('cho duyet')
    || s.includes('cho xu ly')
    || s.includes('chua duyet')
    || s.includes('chua xu ly')
    || s.includes('bao hong')
    || s.includes('dang cho')
    || s === 'cho'
    || s === 'cho duyet';
};

/** Check if a repair status indicates the repair is pending review. */
export const isRepairPending = isRepairAwaitingReview;

/** Check if a repair is in a terminal state. */
export const isRepairDone = (status: string): boolean =>
  isRepairCompleted(status) || isRepairRejected(status);

export const isRepairActive = (status: string): boolean =>
  !isRepairDone(status);

export const isRepairInProgress = (status: string): boolean =>
  isRepairActive(status) && !isRepairAwaitingReview(status);

/** Map a repair status string to a Badge variant for consistent color coding. */
export const getRepairStatusVariant = (status: string): BadgeVariant => {
  const s = normalizeRepairStatus(status);
  if (isRepairRejected(status)) return 'danger';
  if (isRepairCompleted(status) || isRepairAwaitingHandover(status)) return 'success';
  if (isRepairAwaitingReview(status) || s.includes('kiem tra')) return 'warning';
  if (s.includes('sua') || s.includes('duyet')) return 'primary';
  return 'neutral';
};

// ──────────────────────────────────────────────────
// Transfer Status
// ──────────────────────────────────────────────────

export const TRANSFER_STATUS = {
  PENDING_RECEIVE: 'PENDING_RECEIVE',
  COMPLETED: 'COMPLETED',
  RECEIVED: 'RECEIVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type TransferStatus = typeof TRANSFER_STATUS[keyof typeof TRANSFER_STATUS];

/** Human-readable labels for transfer statuses. */
export const transferStatusText: Record<string, string> = {
  [TRANSFER_STATUS.PENDING_RECEIVE]: 'Chờ khoa nhận',
  [TRANSFER_STATUS.COMPLETED]: 'Đã nhận',
  [TRANSFER_STATUS.RECEIVED]: 'Đã nhận',
  [TRANSFER_STATUS.REJECTED]: 'Từ chối',
  [TRANSFER_STATUS.CANCELLED]: 'Đã hủy',
};

/** Map a transfer status string to a Badge variant for consistent color coding. */
export const getTransferStatusVariant = (status: string): BadgeVariant => {
  if (status === TRANSFER_STATUS.COMPLETED || status === TRANSFER_STATUS.RECEIVED) return 'success';
  if (status === TRANSFER_STATUS.REJECTED || status === TRANSFER_STATUS.CANCELLED) return 'danger';
  if (status === TRANSFER_STATUS.PENDING_RECEIVE) return 'warning';
  return 'neutral';
};
