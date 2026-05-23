import { removeVietnameseTones } from './stringUtils.ts';

const UNASSIGNED_DEPARTMENT_LABELS = new Set([
  'chua phan bo',
  'chua ro',
  'khong ro',
  'khong xac dinh',
  'unknown',
  'unassigned',
]);

export const isAssignableDepartment = (department: unknown): department is string => {
  const value = String(department ?? '').trim();
  if (!value) return false;

  const normalizedValue = removeVietnameseTones(value.toLowerCase()).replace(/\s+/g, ' ').trim();
  return !UNASSIGNED_DEPARTMENT_LABELS.has(normalizedValue);
};

export const getAssignableDepartments = (departments: unknown[]): string[] => {
  const assignableDepartments = departments
    .map(department => String(department ?? '').trim())
    .filter(isAssignableDepartment);

  return Array.from(new Set(assignableDepartments)).sort((first, second) => first.localeCompare(second, 'vi'));
};
