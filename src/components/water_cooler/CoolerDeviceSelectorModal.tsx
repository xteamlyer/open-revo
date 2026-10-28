import React, { useState, useEffect, useCallback } from 'react';
import {
  Bluetooth,
  RefreshCw,
  X,
  CheckCircle2,
  Signal,
  Radio,
  Lock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { WaterCoolerDevice } from './coolerTypes';

interface CoolerDeviceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMac?: string;
  onSelectDevice: (device: WaterCoolerDevice) => Promise<void>;
}

export const CoolerDeviceSelectorModal: React.FC<CoolerDeviceSelectorModalProps> = ({
  isOpen,
  onClose,
  currentMac,
  onSelectDevice,
}) => {
  const [devices, setDevices] = useState<WaterCoolerDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectingMac, setSelectingMac] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const list = await invoke<WaterCoolerDevice[]>('scan_water_cooler_devices');
      setDevices(list || []);
      if (!list || list.length === 0) {
        setErrorMsg('No nearby MECHREVO cooler found. Make sure it is powered on and advertising over Bluetooth.');
      }
    } catch (e: any) {
      console.error('Failed to scan water coolers:', e);
      setErrorMsg(typeof e === 'string' ? e : 'Scan failed. Make sure Bluetooth is enabled.');
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
    }
  }, [isOpen, fetchDevices]);

  if (!isOpen) return null;

  const handleSelect = async (dev: WaterCoolerDevice) => {
    if (selectingMac) return;
    setSelectingMac(dev.mac_address);
    setErrorMsg(null);
    try {
      await onSelectDevice(dev);
      onClose();
    } catch (e: any) {
      console.error('Failed to select water cooler:', e);
      setErrorMsg(typeof e === 'string' ? e : 'Failed to switch connection. Please try again.');
    } finally {
      setSelectingMac(null);
    }
  };

  const renderSignalBadge = (rssi?: number) => {
    if (rssi === undefined || rssi === null) {
      return (
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <Signal size={11} /> Offline / Not Advertising
        </span>
      );
    }
    const isStrong = rssi >= -65;
    const isMedium = rssi >= -80 && rssi < -65;
    const color = isStrong ? 'var(--status-ok)' : isMedium ? 'var(--status-info)' : 'var(--status-warning)';
    const text = isStrong ? 'Excellent signal (likely this device)' : isMedium ? 'Good signal' : 'Weak signal (possibly a nearby device)';

    return (
      <span
        style={{
          fontSize: '10px',
          color,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontWeight: 600,
        }}
      >
        <Signal size={11} /> {rssi} dBm · {text}
      </span>
    );
  };

  return (
    <div className="sys-modal-backdrop" onClick={onClose}>
      <div
        className="sys-modal-card"
        style={{ maxWidth: '560px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sys-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              className="sys-modal-icon-badge"
              style={{ background: 'var(--status-info-dim)', color: 'var(--status-info)' }}
            >
              <Radio size={18} />
            </div>
            <div>
              <div className="sys-modal-title">Pair and bind a dedicated liquid cooler</div>
              <div className="sys-modal-subtitle">
                If multiple computers are nearby, bind your own cooler to avoid connecting to a neighbor’s device.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="toggle-btn"
            onClick={onClose}
            style={{ padding: '6px', minWidth: 'auto', borderRadius: 'var(--radius-sm)' }}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="sys-modal-body" style={{ maxHeight: '380px', overflowY: 'auto' }}>
          {/* 工具栏 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Cooler devices found: <strong>{devices.length}</strong> 台
            </span>
            <button
              type="button"
              className="toggle-btn"
              onClick={fetchDevices}
              disabled={isScanning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                padding: '4px 10px',
              }}
            >
              <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
              <span>{isScanning ? 'Scanning nearby BLE devices...' : 'Rescan Devices'}</span>
            </button>
          </div>

          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--status-warning-dim)',
                color: 'var(--status-warning)',
                fontSize: '11px',
                marginBottom: '10px',
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 设备列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {devices.map((dev) => {
              const isSelected = dev.is_current || (currentMac && dev.mac_address.toUpperCase() === currentMac.toUpperCase());
              const isBusy = selectingMac === dev.mac_address;

              return (
                <div
                  key={dev.mac_address}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'var(--status-ok-dim)' : 'var(--surface-card)',
                    border: isSelected
                      ? '1px solid rgba(16, 185, 129, 0.45)'
                      : '1px solid var(--border-subtle)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {dev.name}
                      </span>
                      {isSelected && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--status-ok)',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <CheckCircle2 size={10} /> Locked
                        </span>
                      )}
                      {dev.is_paired && (
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--surface-badge)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          Paired in Windows
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        MAC: {dev.mac_address}
                      </span>
                      {renderSignalBadge(dev.rssi)}
                    </div>
                  </div>

                  <div>
                    {isSelected ? (
                      <button
                        type="button"
                        disabled
                        className="toggle-btn"
                        style={{
                          fontSize: '11px',
                          padding: '5px 12px',
                          opacity: 0.8,
                          cursor: 'default',
                          color: 'var(--status-ok)',
                          borderColor: 'rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        <Lock size={12} style={{ marginRight: '4px' }} />
                        Dedicated control active
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="toggle-btn active-cyan"
                        onClick={() => handleSelect(dev)}
                        disabled={isBusy}
                        style={{
                          fontSize: '11px',
                          padding: '5px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Switching...
                          </>
                        ) : (
                          <>
                            <Bluetooth size={12} />
                            Bind and Connect
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {!isScanning && devices.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 16px',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  background: 'var(--surface-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-subtle)',
                }}
              >
                No available cooler found. Make sure it is powered on and the cooler indicator is lit.
              </div>
            )}
          </div>
        </div>

        {/* Actions & Protection Tip */}
        <div
          className="sys-modal-actions"
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '8px',
            background: 'var(--surface-base)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              lineHeight: 1.4,
            }}
          >
            <Lock size={13} style={{ color: 'var(--status-ok)', flexShrink: 0 }} />
            <span>
              <strong>Dedicated hardware lock is ready</strong>：锁定后软件仅允许与指定物理 MAC
              cooler. Even if nearby coolers advertise the same service, OpenRevo will never connect to them automatically.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
