import React, { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileImage,
  Flashlight,
  Keyboard,
  Loader2,
  RefreshCw,
  ScanLine,
  SwitchCamera,
  X,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { DeviceData } from '../../services/api.ts';
import type {
  InventoryCondition,
  InventoryConfirmPayload,
  QrScannerDialogProps,
  ScanInputTab,
} from './types.ts';
import {
  getDeviceDepartment,
  getDeviceModel,
  getDeviceSerial,
  getDeviceStatus,
  matchDeviceByCode,
} from './qrCodeMatcher.ts';
import './QrScannerDialog.css';

// Serialize camera/file operations across dialogs, including unmount/remount.
let scannerQueue: Promise<unknown> = Promise.resolve();
const enqueue = (task: () => Promise<void>) => {
  const next = scannerQueue.then(task, task);
  scannerQueue = next.catch(() => {});
  return next;
};

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

const conditionOptions: Array<{ value: InventoryCondition; label: string }> = [
  { value: 'ok', label: 'Đúng vị trí' },
  { value: 'damaged', label: 'Hư hỏng' },
  { value: 'maintenance', label: 'Cần bảo trì' },
  { value: 'wrong_location', label: 'Sai khoa/phòng' },
];

export const QrScannerDialog: React.FC<QrScannerDialogProps> = ({
  isOpen,
  onClose,
  mode,
  devices,
  title,
  subtitle,
  activeRunTitle,
  activeRunDepartment = 'all',
  scannedDeviceIds,
  departments = [],
  onConfirmInventory,
  onSelectDevice,
  transferType = 'Mượn',
  checkTransferEligibility,
}) => {
  const uniqueId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const viewportElementId = `qr-viewport-${uniqueId}`;
  const fileReaderElementId = `qr-file-reader-${uniqueId}`;

  // Tabs & Modes
  const [activeTab, setActiveTab] = useState<ScanInputTab>('camera');

  // Camera State
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'scanning' | 'error' | 'denied'>('idle');
  const [cameraErrorMsg, setCameraErrorMsg] = useState('');
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);

  // Match / Result State
  const [matchedDevice, setMatchedDevice] = useState<DeviceData | null>(null);
  const [ambiguousCandidates, setAmbiguousCandidates] = useState<DeviceData[]>([]);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [manualInputCode, setManualInputCode] = useState('');
  const [isReadingImage, setIsReadingImage] = useState(false);

  // Inventory-specific form fields inside result sheet
  const [actualDept, setActualDept] = useState('');
  const [condition, setCondition] = useState<InventoryCondition>('ok');
  const [inventoryNote, setInventoryNote] = useState('');
  const [isSavingInventory, setIsSavingInventory] = useState(false);
  const [inventorySaveSuccess, setInventorySaveSuccess] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState('');

  // Refs for camera lifecycle and stale callback guard
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const sessionRef = useRef(0);
  const isMountedRef = useRef(true);

  // Set up mount ref
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processRef = useRef<(code: string) => void>(() => {});
  const closeRef = useRef(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  useLayoutEffect(() => { closeRef.current = onClose; });

  const disposeScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { if (scanner.isScanning) await scanner.stop(); }
    finally { try { scanner.clear(); } catch { /* Already removed. */ } }
  }, []);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    return enqueue(async () => { await disposeScanner(); });
  }, [disposeScanner]);

  // Handle scanned code from any input source (camera, image, manual)
  const handleProcessCode = useCallback((rawCode: string) => {
    const result = matchDeviceByCode(devices, rawCode);

    if (result.status === 'found') {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(50);
        }
      } catch {
        // Haptics optional
      }
      setMatchedDevice(result.device);
      setAmbiguousCandidates([]);
      setNotFoundCode(null);
      setInventorySaveSuccess(false);

      // Auto-set initial inventory form values
      const expectedDept = getDeviceDepartment(result.device);
      const defaultActual = activeRunDepartment === 'all' ? expectedDept : activeRunDepartment;
      setActualDept(defaultActual);
      setCondition(expectedDept !== defaultActual ? 'wrong_location' : 'ok');
      setInventoryNote('');

      // Pause camera while reviewing result
      void stopCamera();
    } else if (result.status === 'ambiguous') {
      setMatchedDevice(null);
      setAmbiguousCandidates(result.devices);
      setNotFoundCode(null);
      void stopCamera();
    } else if (result.status === 'not_found') {
      setMatchedDevice(null);
      setAmbiguousCandidates([]);
      setNotFoundCode(result.code);
    }
  }, [devices, activeRunDepartment, stopCamera]);

  useLayoutEffect(() => { processRef.current = handleProcessCode; }, [handleProcessCode]);

  const startCamera = useCallback((cameraId?: string) => {
    const currentSession = ++sessionRef.current;
    setCameraStatus('starting');
    setCameraErrorMsg('');
    setIsTorchSupported(false);
    setIsTorchOn(false);
    return enqueue(async () => {
      await disposeScanner();
      const isCurrent = () => isMountedRef.current && sessionRef.current === currentSession;
      if (!isCurrent() || !document.getElementById(viewportElementId)) return;
      try {
        const scanner = new Html5Qrcode(viewportElementId, { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
        scannerRef.current = scanner;
        await scanner.start(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
          { fps: 12, qrbox: (width, height) => ({ width: Math.min(230, width - 24), height: Math.min(230, height - 24) }) },
          code => { if (isCurrent()) processRef.current(code); }, () => {});
        if (!isCurrent()) { await disposeScanner(); return; }
        setCameraStatus('scanning');
        try {
          const caps = scanner.getRunningTrackCapabilities() as { torch?: boolean };
          setIsTorchSupported(caps.torch === true);
        } catch { setIsTorchSupported(false); }
        // Enumerate only after permission has been granted by start().
        void Html5Qrcode.getCameras().then(list => {
          if (!isCurrent()) return;
          setCameras(list);
          const settings = scanner.getRunningTrackSettings();
          setActiveCameraIndex(Math.max(0, list.findIndex(camera => camera.id === settings.deviceId)));
        }).catch(() => {});
      } catch (error) {
        await disposeScanner().catch(() => {});
        if (!isCurrent()) return;
        const denied = /permission|notallowed/i.test(String(error));
        setCameraStatus(denied ? 'denied' : 'error');
        setCameraErrorMsg(denied
          ? 'Chưa có quyền camera. Hãy cấp quyền trong trình duyệt, chọn ảnh hoặc nhập mã.'
          : 'Không mở được camera. Hãy thử lại, chọn ảnh hoặc nhập mã.');
      }
    });
  }, [disposeScanner, viewportElementId]);

  // Flashlight toggle
  const handleToggleTorch = async () => {
    const scanner = scannerRef.current;
    if (!scanner || !isTorchSupported) return;
    try {
      const nextState = !isTorchOn;
      await scanner.applyVideoConstraints({
        // @ts-expect-error torch is a valid media track constraint in chromium/mobile
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch {
      setIsTorchSupported(false);
    }
  };

  // Switch camera (front / back)
  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIndex);
    const nextCamera = cameras[nextIndex];
    if (nextCamera) {
      await startCamera(nextCamera.id);
    }
  };

  // Image file scan
  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const currentSession = ++sessionRef.current;
    setIsReadingImage(true);
    setNotFoundCode(null);
    await enqueue(async () => {
      await disposeScanner();
      const isCurrent = () => isMountedRef.current && sessionRef.current === currentSession;
      if (!isCurrent()) return;
      let fileScanner: Html5Qrcode | null = null;
      try {
        fileScanner = new Html5Qrcode(fileReaderElementId, { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
        const decodedText = await fileScanner.scanFile(file, false);
        if (isCurrent()) { setIsReadingImage(false); processRef.current(decodedText); }
      } catch {
        if (isCurrent()) { setCameraErrorMsg('Không đọc được mã trong ảnh. Hãy chọn ảnh rõ hơn.'); setIsReadingImage(false); }
      } finally {
        try { fileScanner?.clear(); } catch { /* DOM may have been removed. */ }
      }
    });
  };

  // Manual code submission
  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualInputCode.trim()) return;
    handleProcessCode(manualInputCode);
  };

  // Reset to scan another device
  const handleScanAgain = () => {
    setMatchedDevice(null);
    setAmbiguousCandidates([]);
    setNotFoundCode(null);
    setInventorySaveSuccess(false);
    setSaveStatusMessage('');
    setManualInputCode('');
  };

  // Matching a device stops the source without clearing the result card.
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !matchedDevice && ambiguousCandidates.length === 0) void startCamera();
    return () => { void stopCamera(); };
  }, [isOpen, activeTab, matchedDevice, ambiguousCandidates.length, startCamera, stopCamera]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) { void stopCamera(); setCameraStatus('idle'); }
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!savingRef.current) closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(item => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  // Auto-sync condition if actual department changes in inventory
  const handleActualDeptChange = (nextDept: string) => {
    setActualDept(nextDept);
    if (matchedDevice) {
      const expected = getDeviceDepartment(matchedDevice);
      if (expected && nextDept && expected !== nextDept) {
        setCondition('wrong_location');
      } else if (condition === 'wrong_location') {
        setCondition('ok');
      }
    }
  };

  // Confirm actions
  const handleConfirmInventory = async () => {
    if (!matchedDevice || !onConfirmInventory || savingRef.current || scannedDeviceIds?.has(matchedDevice.id)) return;
    savingRef.current = true;
    setIsSavingInventory(true);
    setSaveStatusMessage('');
    try {
      const payload: InventoryConfirmPayload = {
        device: matchedDevice,
        actualDepartment: actualDept || getDeviceDepartment(matchedDevice),
        condition,
        note: inventoryNote.trim(),
      };
      const result = await onConfirmInventory(payload);
      if (result.success) {
        setInventorySaveSuccess(true);
        setSaveStatusMessage(result.message || `Đã ghi nhận kiểm kê cho thiết bị ${matchedDevice.id}.`);
      } else {
        setSaveStatusMessage(result.message || 'Lưu thất bại. Vui lòng thử lại.');
      }
    } catch (error) {
      setSaveStatusMessage(error instanceof Error ? error.message : 'Có lỗi khi lưu.');
    } finally {
      savingRef.current = false;
      setIsSavingInventory(false);
    }
  };

  const handleConfirmSelect = () => {
    if (!matchedDevice) return;
    if (mode === 'transfer' && checkTransferEligibility && !checkTransferEligibility(matchedDevice).eligible) return;
    onSelectDevice?.(matchedDevice);
    onClose();
  };

  if (!isOpen) return null;

  // Mode-specific texts
  const displayTitle = title || (
    mode === 'inventory'
      ? 'Quét thiết bị kiểm kê'
      : mode === 'repair'
        ? 'Quét thiết bị báo hỏng'
        : 'Quét thiết bị luân chuyển'
  );

  const displaySubtitle = subtitle || (
    mode === 'inventory'
      ? (activeRunTitle ? `Đợt: ${activeRunTitle}` : 'Kiểm kê định kỳ')
      : mode === 'repair'
        ? 'Báo hỏng / sửa chữa'
        : (transferType === 'Trả' ? 'Hoàn trả thiết bị' : 'Yêu cầu mượn thiết bị')
  );

  // Contextual checks for matched device
  const expectedDept = matchedDevice ? getDeviceDepartment(matchedDevice) : '';
  const isDeptMismatch = matchedDevice && activeRunDepartment !== 'all' && expectedDept !== activeRunDepartment;
  const isAlreadyScanned = matchedDevice && scannedDeviceIds?.has(matchedDevice.id);

  // Transfer eligibility check
  const transferEligibility = matchedDevice && mode === 'transfer' && checkTransferEligibility
    ? checkTransferEligibility(matchedDevice)
    : { eligible: true };

  return createPortal(
    <div ref={dialogRef} tabIndex={-1} className="qr-dialog-backdrop" onClick={() => { if (!savingRef.current) onClose(); }} role="dialog" aria-modal="true" aria-label={displayTitle}>
      <div className="qr-dialog-window" onClick={event => event.stopPropagation()}>
        {/* Header */}
        <div className="qr-dialog-header">
          <div className="qr-dialog-header-info">
            <h2 className="qr-dialog-title">
              <ScanLine size={20} style={{ color: '#14b8a6' }} />
              <span>{displayTitle}</span>
            </h2>
            {displaySubtitle && <p className="qr-dialog-subtitle">{displaySubtitle}</p>}
          </div>
          <button
            type="button"
            className="qr-dialog-close-btn"
            onClick={onClose}
            disabled={isSavingInventory}
            aria-label="Đóng máy quét"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Tabs (Camera / Ảnh / Nhập mã) */}
        {!matchedDevice && (
          <div className="qr-dialog-tabs" role="tablist" aria-label="Phương thức quét">
            <button
              type="button"
              className={`qr-dialog-tab-btn ${activeTab === 'camera' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('camera')}
              role="tab"
              aria-selected={activeTab === 'camera'}
            >
              <Camera size={16} />
              <span>Camera</span>
            </button>
            <button
              type="button"
              className={`qr-dialog-tab-btn ${activeTab === 'image' ? 'is-active' : ''}`}
              onClick={() => { setCameraErrorMsg(''); setIsReadingImage(false); setActiveTab('image'); }}
              role="tab"
              aria-selected={activeTab === 'image'}
            >
              <FileImage size={16} />
              <span>Chọn ảnh</span>
            </button>
            <button
              type="button"
              className={`qr-dialog-tab-btn ${activeTab === 'manual' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('manual')}
              role="tab"
              aria-selected={activeTab === 'manual'}
            >
              <Keyboard size={16} />
              <span>Nhập mã</span>
            </button>
          </div>
        )}

        <div id={fileReaderElementId} style={{ display: 'none' }} aria-hidden="true" />
        {/* Dialog Body */}
        <div className={`qr-dialog-body ${matchedDevice ? 'has-result' : ''}`}>
          {/* CAMERA TAB */}
          {activeTab === 'camera' && (
            <div className="qr-camera-stage" style={{ display: matchedDevice ? 'none' : undefined }}>
            <div className="qr-camera-viewport">
              <div id={viewportElementId} className="qr-scanner-element" aria-live="polite" />

              {/* Overlaid Reticle */}
              {cameraStatus === 'scanning' && (
                <>
                  <div className="qr-camera-reticle" aria-hidden="true">
                    <span className="qr-corner qr-corner-tl" />
                    <span className="qr-corner qr-corner-tr" />
                    <span className="qr-corner qr-corner-bl" />
                    <span className="qr-corner qr-corner-br" />
                    <span className="qr-laser-line" />
                  </div>

                  <div className="qr-guide-text">
                    Đưa mã QR hoặc mã vạch vào trong khung
                  </div>

                  {/* Torch and Camera Flip controls */}
                  <div className="qr-camera-controls">
                    {isTorchSupported && (
                      <button
                        type="button"
                        className={`qr-control-btn ${isTorchOn ? 'is-active' : ''}`}
                        onClick={handleToggleTorch}
                        aria-label="Bật/tắt đèn pin"
                      >
                        <Flashlight size={16} />
                        <span>{isTorchOn ? 'Tắt đèn' : 'Bật đèn'}</span>
                      </button>
                    )}
                    {cameras.length > 1 && (
                      <button
                        type="button"
                        className="qr-control-btn"
                        onClick={handleSwitchCamera}
                        aria-label="Đổi camera"
                      >
                        <SwitchCamera size={16} />
                        <span>Đổi camera</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Camera Starting / Loading State */}
              {cameraStatus === 'idle' && (
                <div className="qr-camera-placeholder">
                  <button type="button" className="qr-btn-primary" onClick={() => void startCamera()}>Mở lại camera</button>
                </div>
              )}
              {cameraStatus === 'starting' && (
                <div className="qr-camera-placeholder">
                  <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#14b8a6' }} />
                  <p>Đang khởi động camera...</p>
                </div>
              )}

              {/* Camera Denied / Error State */}
              {(cameraStatus === 'denied' || cameraStatus === 'error') && (
                <div className="qr-camera-placeholder">
                  <AlertCircle size={36} style={{ color: '#f87171' }} />
                  <p>{cameraErrorMsg}</p>
                  <div className="qr-placeholder-actions">
                    <button type="button" className="qr-btn-primary" onClick={() => void startCamera()}>
                      <RefreshCw size={16} /> Thử lại
                    </button>
                    <button type="button" className="qr-btn-secondary" onClick={() => { setCameraErrorMsg(''); setIsReadingImage(false); setActiveTab('image'); }}>
                      <FileImage size={16} /> Chọn ảnh
                    </button>
                    <button type="button" className="qr-btn-secondary" onClick={() => setActiveTab('manual')}>
                      <Keyboard size={16} /> Nhập mã
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          )}

          {/* IMAGE TAB */}
          {activeTab === 'image' && !matchedDevice && (
            <div className="qr-image-mode-panel">
              <label className="qr-image-upload-box">
                <FileImage size={40} style={{ color: '#0d9488' }} />
                <strong>{isReadingImage ? 'Đang đọc mã từ ảnh...' : 'Chọn hoặc chụp ảnh có mã'}</strong>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Hỗ trợ ảnh PNG, JPG, WebP</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  disabled={isReadingImage}
                />
              </label>
              {cameraErrorMsg && <p role="alert">{cameraErrorMsg}</p>}
            </div>
          )}

          {/* MANUAL TAB */}
          {activeTab === 'manual' && !matchedDevice && (
            <div className="qr-manual-mode-panel">
              <form className="qr-manual-form" onSubmit={handleManualSubmit}>
                <label htmlFor="qr-manual-input" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#cbd5e1' }}>
                  Nhập mã quản lý, số serial hoặc dán URL tem QR:
                </label>
                <div className="qr-manual-row">
                  <input
                    id="qr-manual-input"
                    type="text"
                    className="qr-manual-input"
                    value={manualInputCode}
                    onChange={event => setManualInputCode(event.target.value)}
                    placeholder="VD: TB-001 hoặc serial máy"
                    autoFocus
                  />
                  <button type="submit" className="qr-btn-primary" style={{ flex: '0 0 auto', padding: '0 16px' }}>
                    Tìm kiếm
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* NOT FOUND NOTIFICATION */}
          {notFoundCode && !matchedDevice && (
            <div style={{ padding: '14px 18px' }}>
              <div className="qr-notice-box qr-notice-danger" role="alert">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Không tìm thấy thiết bị</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
                    Mã <code>{notFoundCode}</code> không khớp với thiết bị nào trong danh mục.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AMBIGUOUS MULTI-MATCH CANDIDATES */}
          {ambiguousCandidates.length > 0 && !matchedDevice && (
            <div style={{ padding: '14px 18px' }}>
              <div className="qr-notice-box qr-notice-warning" role="alert">
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Mã trùng lặp ({ambiguousCandidates.length} thiết bị)</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
                    Mã khớp với nhiều thiết bị. Vui lòng quét lại mã quản lý đầy đủ, không dùng serial trùng:
                  </p>
                </div>
              </div>
              <button type="button" className="qr-btn-secondary" onClick={handleScanAgain}>Quét lại mã đầy đủ</button>
            </div>
          )}

          {/* MATCHED DEVICE RESULT CARD */}
          {matchedDevice && (
            <div className="qr-result-container">
              <div className="qr-result-header">
                <div className="qr-device-title-row">
                  <h3 className="qr-device-name">{matchedDevice.name}</h3>
                  <a
                    href={`${window.location.origin}${import.meta.env.BASE_URL}devices/${encodeURIComponent(matchedDevice.id)}`}
                    className="qr-link-profile"
                    title="Xem hồ sơ thiết bị"
                  >
                    <span>Hồ sơ</span>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="qr-device-meta-row">
                  <div className="qr-device-meta-item">
                    <span>Mã TB:</span>
                    <strong>{matchedDevice.id}</strong>
                  </div>
                  {getDeviceSerial(matchedDevice) && (
                    <div className="qr-device-meta-item">
                      <span>Serial:</span>
                      <strong>{getDeviceSerial(matchedDevice)}</strong>
                    </div>
                  )}
                  {getDeviceModel(matchedDevice) && (
                    <div className="qr-device-meta-item">
                      <span>Model:</span>
                      <strong>{getDeviceModel(matchedDevice)}</strong>
                    </div>
                  )}
                  <div className="qr-device-meta-item">
                    <span>Khoa quản lý:</span>
                    <strong>{expectedDept}</strong>
                  </div>
                  <div className="qr-device-meta-item">
                    <span>Tình trạng:</span>
                    <strong>{getDeviceStatus(matchedDevice)}</strong>
                  </div>
                </div>
              </div>

              {/* Contextual Notices */}
              {isDeptMismatch && (
                <div className="qr-notice-box qr-notice-warning" role="alert">
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Khác khoa đợt kiểm kê</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                      Thiết bị thuộc <strong>{expectedDept}</strong>, khác với khoa kiểm kê hiện tại (<strong>{activeRunDepartment}</strong>).
                    </p>
                  </div>
                </div>
              )}

              {isAlreadyScanned && (
                <div className="qr-notice-box qr-notice-info" role="alert">
                  <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Đã kiểm kê trong đợt</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                      Thiết bị này đã được ghi nhận trước đó. Không ghi nhận thêm lần nữa. Hãy quét thiết bị tiếp theo.
                    </p>
                  </div>
                </div>
              )}

              {/* Transfer eligibility notice */}
              {mode === 'transfer' && !transferEligibility.eligible && (
                <div className="qr-notice-box qr-notice-danger" role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Không đủ điều kiện luân chuyển</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                      {transferEligibility.reason || 'Thiết bị không đáp ứng điều kiện điều chuyển theo quy tắc tồn tối thiểu hoặc trạng thái hiện tại.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Save status message for inventory */}
              {saveStatusMessage && (
                <div className={`qr-notice-box ${inventorySaveSuccess ? 'qr-notice-success' : 'qr-notice-danger'}`} role="alert">
                  {inventorySaveSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <span>{saveStatusMessage}</span>
                </div>
              )}

              {/* INVENTORY SPECIFIC FORM FIELDS */}
              {mode === 'inventory' && !inventorySaveSuccess && (
                <div className="qr-inventory-fields">
                  <div className="qr-field">
                    <label htmlFor="qr-actual-dept">Khoa/phòng thực tế</label>
                    <select
                      id="qr-actual-dept"
                      value={actualDept}
                      onChange={e => handleActualDeptChange(e.target.value)}
                      disabled={isSavingInventory}
                    >
                      <option value="">-- Chọn khoa/phòng --</option>
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  <div className="qr-field">
                    <label htmlFor="qr-condition">Tình trạng kiểm kê</label>
                    <select
                      id="qr-condition"
                      value={condition}
                      onChange={e => setCondition(e.target.value as InventoryCondition)}
                      disabled={isSavingInventory}
                    >
                      {conditionOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="qr-field qr-field-full">
                    <label htmlFor="qr-note">Ghi chú (tùy chọn)</label>
                    <input
                      id="qr-note"
                      type="text"
                      value={inventoryNote}
                      onChange={e => setInventoryNote(e.target.value)}
                      placeholder="Hiện trạng, phụ kiện, số phòng..."
                      disabled={isSavingInventory}
                    />
                  </div>
                </div>
              )}

              {/* ACTIONS */}
              <div className="qr-result-actions">
                <button
                  type="button"
                  className="qr-btn-secondary"
                  onClick={handleScanAgain}
                  disabled={isSavingInventory}
                >
                  <RefreshCw size={16} />
                  <span>Quét lại</span>
                </button>

                {mode === 'inventory' ? (
                  inventorySaveSuccess ? (
                    <button
                      type="button"
                      className="qr-btn-primary"
                      onClick={handleScanAgain}
                    >
                      <span>Quét thiết bị tiếp theo</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="qr-btn-primary"
                      onClick={handleConfirmInventory}
                      disabled={isSavingInventory || !actualDept || Boolean(isAlreadyScanned)}
                    >
                      {isSavingInventory ? (
                        <>
                          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <span>Xác nhận kiểm kê</span>
                      )}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="qr-btn-primary"
                    onClick={handleConfirmSelect}
                    disabled={mode === 'transfer' && !transferEligibility.eligible}
                  >
                    <span>Dùng thiết bị này</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>, document.body
  );
};

export default QrScannerDialog;
