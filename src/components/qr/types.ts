import type { DeviceData } from '../../services/api.ts';

export type InventoryCondition = 'ok' | 'damaged' | 'maintenance' | 'wrong_location';

export interface MatchSuccess {
  status: 'found';
  device: DeviceData;
  matchedBy: 'id' | 'alias' | 'serial';
  code: string;
}

export interface MatchAmbiguous {
  status: 'ambiguous';
  devices: DeviceData[];
  code: string;
  message: string;
}

export interface MatchNotFound {
  status: 'not_found';
  code: string;
  message: string;
}

export interface MatchEmpty {
  status: 'empty';
  message: string;
}

export type DeviceMatchResult = MatchSuccess | MatchAmbiguous | MatchNotFound | MatchEmpty;

export type QrScannerMode = 'inventory' | 'repair' | 'transfer';
export type ScanInputTab = 'camera' | 'image' | 'manual';

export interface InventoryConfirmPayload {
  device: DeviceData;
  actualDepartment: string;
  condition: InventoryCondition;
  note: string;
}

export interface QrScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: QrScannerMode;
  devices: DeviceData[];
  title?: string;
  subtitle?: string;

  // Inventory specific
  activeRunTitle?: string;
  activeRunDepartment?: string;
  scannedDeviceIds?: Set<string>;
  departments?: string[];
  onConfirmInventory?: (payload: InventoryConfirmPayload) => Promise<{ success: boolean; message?: string }>;

  // Repair & Transfer specific
  onSelectDevice?: (device: DeviceData) => void;

  // Transfer specific
  transferType?: 'Mượn' | 'Trả';
  userDepartment?: string;
  checkTransferEligibility?: (device: DeviceData) => { eligible: boolean; reason?: string };
}
