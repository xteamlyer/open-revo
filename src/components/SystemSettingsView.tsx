import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  FolderOpen,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Crosshair,
  Globe,
  Gauge,
  Lightbulb,
  Zap,
  Cpu,
  Cable,
  Sliders,
  Droplets,
  Download,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { HardwareState } from '../types/hardware';
import { RevBadge, RevSwitch } from './ui';
import { ModelCapabilities } from '../plugins/plugin_manifest';

export interface OsdConfig {
  enabled: boolean;
  theme: 'cinema' | 'fade' | 'pill';
  scale: string;
  position: 'top-left' | 'bottom-center' | 'center';
}

export interface SystemSettingsViewProps {
  status: HardwareState;
  osdConfig: OsdConfig;
  onUpdateOsdConfig: (cfg: OsdConfig) => void;
  onToggleWinKey?: () => void;
  onToggleAutostart: () => void;
  onToggleWaterCooler?: (enabled: boolean) => void;
  moduleToggles?: Record<string, boolean>;
  onToggleModule?: (id: string, enabled: boolean) => void;
  capabilities?: ModelCapabilities;
  previewMode?: 'real' | 'thin_light' | 'gaming';
  onPreviewFormFactor?: (mode: 'real' | 'thin_light' | 'gaming') => void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  status,
  osdConfig,
  onUpdateOsdConfig: handleUpdateOsdConfig,
  onToggleWinKey: _onToggleWinKey,
  onToggleAutostart,
  onToggleWaterCooler: _onToggleWaterCooler,
  moduleToggles: _moduleToggles,
  onToggleModule: _onToggleModule,
  capabilities,
  previewMode = 'real',
  onPreviewFormFactor,
}) => {

  const [logStatus, setLogStatus] = useState<{
    visible: boolean;
    enabled: boolean;
    level: number;
    path: string;
    filter?: string | null;
  }>({
    visible: false,
    enabled: false,
    level: 1,
    path: '',
    filter: null,
  });

  const [wakeWindowMode, setWakeWindowMode] = useState<'remember' | 'mini' | 'full'>('remember');
  const [miniAutoHide, setMiniAutoHide] = useState(true);
  const [unlockBatteryLimit, setUnlockBatteryLimit] = useState(!!status.unlock_battery_power_limit);
  const [showUnlockBatteryConfirm, setShowUnlockBatteryConfirm] = useState(false);
  const [togglingUnlockBattery, setTogglingUnlockBattery] = useState(false);

  useEffect(() => {
    if (typeof status.unlock_battery_power_limit === 'boolean') {
      setUnlockBatteryLimit(status.unlock_battery_power_limit);
    }
  }, [status.unlock_battery_power_limit]);

  const handleToggleUnlockBattery = async (nextVal: boolean) => {
    if (nextVal) {
      setShowUnlockBatteryConfirm(true);
    } else {
      setTogglingUnlockBattery(true);
      try {
        await invoke('set_unlock_battery_power_limit', { enable: false });
        setUnlockBatteryLimit(false);
      } catch (err: any) {
        alert('Failed to remove battery-power restrictions: ' + err);
      } finally {
        setTogglingUnlockBattery(false);
      }
    }
  };

  const handleConfirmUnlockBattery = async () => {
    setTogglingUnlockBattery(true);
    try {
      await invoke('set_unlock_battery_power_limit', { enable: true });
      setUnlockBatteryLimit(true);
      setShowUnlockBatteryConfirm(false);
    } catch (err: any) {
      alert('Failed to enable battery-power restriction removal: ' + err);
    } finally {
      setTogglingUnlockBattery(false);
    }
  };

  useEffect(() => {
    invoke<string>('get_wake_window_mode')
      .then((mode) => {
        if (mode === 'remember' || mode === 'mini' || mode === 'full') {
          setWakeWindowMode(mode);
        }
      })
      .catch(() => { });

    invoke<boolean>('get_mini_auto_hide')
      .then((val) => {
        if (typeof val === 'boolean') {
          setMiniAutoHide(val);
        }
      })
      .catch(() => { });
  }, []);

  const handleUpdateWakeMode = async (mode: 'remember' | 'mini' | 'full') => {
    setWakeWindowMode(mode);
    try {
      await invoke('set_wake_window_mode', { mode });
    } catch (e) {
      console.error('Failed to set wake window mode:', e);
    }
  };

  const handleToggleMiniAutoHide = async (enabled: boolean) => {
    setMiniAutoHide(enabled);
    try {
      await invoke('set_mini_auto_hide', { enabled });
    } catch (e) {
      console.error('Failed to set mini drawer auto hide:', e);
    }
  };

  useEffect(() => {
    invoke<any>('get_log_status')
      .then((res) => {
        if (res) {
          setLogStatus({
            visible: !!res.visible,
            enabled: !!res.enabled,
            level: typeof res.level === 'number' ? res.level : 1,
            path: res.path || '',
            filter: res.filter || null,
          });
        }
      })
      .catch(() => { });
  }, []);

  const handleSetLogLevel = async (lvl: number) => {
    try {
      const res = await invoke<any>('set_log_level', { level: lvl });
      if (res) {
        setLogStatus({
          visible: !!res.visible,
          enabled: !!res.enabled,
          level: typeof res.level === 'number' ? res.level : lvl,
          path: res.path || logStatus.path,
          filter: res.filter || null,
        });
      }
    } catch (_) { }
  };

  const handleSetLogFilter = async (filter: string | null) => {
    try {
      const res = await invoke<any>('set_log_filter', { filter: filter || null });
      if (res) {
        setLogStatus({
          visible: !!res.visible,
          enabled: !!res.enabled,
          level: typeof res.level === 'number' ? res.level : logStatus.level,
          path: res.path || logStatus.path,
          filter: res.filter || null,
        });
      }
    } catch (_) { }
  };

  const handleOpenLog = () => {
    invoke('open_log_file').catch(() => { });
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  // User Data Directory & Migration
  const [dataDirInfo, setDataDirInfo] = useState<{ path: string; mode: string } | null>(null);
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [migrateTargetPath, setMigrateTargetPath] = useState('');
  const [migratingData, setMigratingData] = useState(false);

  const fetchUserDataDirInfo = async () => {
    try {
      const info = await invoke<{ path: string; mode: string }>('get_user_data_dir_info');
      setDataDirInfo(info);
    } catch (_) { }
  };

  useEffect(() => {
    fetchUserDataDirInfo();
  }, []);

  const handleOpenUserDataDir = async () => {
    try {
      await invoke('open_user_data_dir');
    } catch (err: any) {
      alert('Unable to open user data directory: ' + err);
    }
  };

  const handleClearUserData = async () => {
    setClearingData(true);
    try {
      await invoke('clear_user_data_dir');
      setShowClearConfirm(false);
      alert('OpenRevo user data was cleared successfully!\nRestart the app to reinitialize the default configuration.');
      fetchUserDataDirInfo();
    } catch (err: any) {
      alert('Failed to clear data: ' + err);
    } finally {
      setClearingData(false);
    }
  };

  const handleMigrateData = async () => {
    if (!migrateTargetPath.trim()) return;
    setMigratingData(true);
    try {
      await invoke('migrate_user_data_dir', { targetPath: migrateTargetPath.trim() });
      await fetchUserDataDirInfo();
      setShowMigrateModal(false);
      setMigrateTargetPath('');
      alert('User data directory moved to: ' + migrateTargetPath.trim());
    } catch (err: any) {
      alert('Failed to move data directory: ' + err);
    } finally {
      setMigratingData(false);
    }
  };

  // Auto-Updater State & Handlers
  interface UpdateCheckResult {
    has_update: boolean;
    current_version: string;
    current_commit: string;
    latest_version: string;
    latest_commit: string;
    display_version: string;
    notes: string;
    chosen_source: string;
    asset_type: string;
    filename: string;
    download_url: string;
    size: number;
    sha256: string;
  }

  interface DownloadProgressPayload {
    downloaded: number;
    total: number;
    percentage: number;
    speed_bytes_per_sec: number;
  }

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DownloadProgressPayload>('updater-progress', (event) => {
      setDownloadProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleCheckForUpdates = async (silent: boolean = false) => {
    setCheckingUpdate(true);
    try {
      const res = await invoke<UpdateCheckResult>('check_for_updates_cmd', { preferredSource: null });
      setUpdateResult(res);
      if (res.has_update) {
        setShowUpdateModal(true);
      } else if (!silent) {
        alert(`You are already using the latest version (${res.display_version || res.current_version})!\nNo updates available.`);
      }
    } catch (err: any) {
      if (!silent) {
        alert('Failed to check for updates: ' + err);
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updateResult) return;
    setDownloadingUpdate(true);
    setDownloadProgress({ downloaded: 0, total: updateResult.size, percentage: 0, speed_bytes_per_sec: 0 });
    try {
      await invoke('download_and_install_update_cmd', {
        downloadUrl: updateResult.download_url,
        expectedSha256: updateResult.sha256,
        filename: updateResult.filename,
        isInstaller: updateResult.asset_type === 'installer',
      });
    } catch (err: any) {
      alert('Failed to download or install update: ' + err);
      setDownloadingUpdate(false);
    }
  };

  const [powerSchemes, setPowerSchemes] = useState<{ guid: string; name: string; is_active: boolean }[]>([]);
  const [switchingScheme, setSwitchingScheme] = useState(false);

  const fetchPowerSchemes = async () => {
    try {
      const list = await invoke<any[]>('get_windows_power_schemes');
      if (list && Array.isArray(list)) {
        setPowerSchemes(list);
      }
    } catch (_) { }
  };

  React.useEffect(() => {
    fetchPowerSchemes();
  }, []);

  const handleSwitchPowerScheme = async (guid: string) => {
    if (!guid) return;
    setSwitchingScheme(true);
    try {
      await invoke('set_active_windows_power_scheme', { guid });
      await fetchPowerSchemes();
    } catch (e: any) {
      alert('Failed to switch power plan: ' + e);
    } finally {
      setSwitchingScheme(false);
    }
  };

  const [restoringPowerPlan, setRestoringPowerPlan] = useState(false);
  const [showRestorePlanConfirm, setShowRestorePlanConfirm] = useState(false);
  const [restorePlanMsg, setRestorePlanMsg] = useState<string | null>(null);

  const handleRestoreOfficialPowerPlan = async () => {
    setShowRestorePlanConfirm(false);
    setRestoringPowerPlan(true);
    try {
      const res = await invoke<string>('restore_official_power_plan');
      await fetchPowerSchemes();
      setRestorePlanMsg(res || 'Factory power plans and PPM scheduling restored successfully!');
      setTimeout(() => setRestorePlanMsg(null), 5000);
    } catch (e: any) {
      console.error('Failed to restore official power plan:', e);
      setRestorePlanMsg('Repair failed: ' + String(e));
      setTimeout(() => setRestorePlanMsg(null), 5000);
    } finally {
      setRestoringPowerPlan(false);
    }
  };

  return (
    <div className="sys-page">
      <div className="glass-card">
        <h3 className="sys-section-title">System feature toggles</h3>
        <div className="sys-rows">

          {/* OSD 屏幕悬浮提示 */}
          <div className="quick-row" style={{ alignItems: 'center' }}>
            <div>
              <div className="sys-row-label">
                <span>OSD On-Screen Notifications</span>
                <RevBadge variant="info">HUD</RevBadge>
              </div>
              <div className="sys-row-desc">
                Show status notifications when using hotkeys. Choose from 3 styles, sizes, and screen positions.
              </div>
            </div>
            <div className="sys-row-controls">
              {/* 风格 */}
              <div className="sys-row-controls">
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Style</span>
                <select
                  value={osdConfig.theme}
                  onChange={(e) => handleUpdateOsdConfig({ ...osdConfig, theme: e.target.value as any })}
                  className="rev-select"
                >
                  <option value="cinema">Cinema Subtitles</option>
                  <option value="fade">Right Fade</option>
                  <option value="pill">Frosted Pill</option>
                </select>
              </div>

              {/* 大小 */}
              <div className="sys-row-controls">
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Size</span>
                <select
                  value={osdConfig.scale}
                  onChange={(e) => handleUpdateOsdConfig({ ...osdConfig, scale: e.target.value })}
                  className="rev-select"
                >
                  <option value="80%">80%</option>
                  <option value="100%">100%</option>
                  <option value="120%">120%</option>
                  <option value="140%">140%</option>
                </select>
              </div>

              {/* 位置 */}
              <div className="sys-row-controls">
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Position</span>
                <select
                  value={osdConfig.position}
                  onChange={(e) => handleUpdateOsdConfig({ ...osdConfig, position: e.target.value as any })}
                  className="rev-select"
                >
                  <option value="top-left">Top Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="center">Screen Center</option>
                </select>
              </div>

              {/* 效果预览 */}
              <button
                onClick={async () => {
                  try {
                    await invoke('trigger_osd_preview');
                  } catch (err) {
                    console.error('Failed to trigger OSD preview:', err);
                  }
                }}
                className="toggle-btn"
                title="Show a preview of the current OSD settings on screen"
                style={{ borderColor: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc' }}
              >
                Preview
              </button>

              {/* 启用/关闭切换 */}
              <RevSwitch
                checked={osdConfig.enabled}
                onChange={(enabled) => handleUpdateOsdConfig({ ...osdConfig, enabled })}
              />
            </div>
          </div>

          {/* 开机自动启动 */}
          <div className="quick-row">
            <div>
              <div className="sys-row-label">Launch at startup (minimize to tray)</div>
              <div className="sys-row-desc">Load drivers and the previous configuration at startup</div>
            </div>
            <RevSwitch
              checked={!!status.autostart}
              onChange={onToggleAutostart}
            />
          </div>

          {/* 解除离电限制 (允许电池下启用狂暴与自定义) */}
          <div className="quick-row" style={{ alignItems: 'center' }}>
            <div>
              <div className="sys-row-label">
                <span>Remove Battery-Power Restrictions</span>
                <RevBadge variant={unlockBatteryLimit ? 'warning' : 'default'}>
                  {unlockBatteryLimit ? 'Restrictions Removed (Use at Your Own Risk)' : 'Factory Safety Restrictions'}
                </RevBadge>
                <RevBadge variant="accent">Power Gating</RevBadge>
              </div>
              <div className="sys-row-desc">
                Allows Performance and Enthusiast modes while unplugged or using USB-C power. The system will not force a switch to Balanced mode when unplugged. Useful for custom low-power or battery-performance tuning.
              </div>
            </div>
            <div className="sys-row-controls">
              <RevSwitch
                checked={unlockBatteryLimit}
                disabled={togglingUnlockBattery}
                onChange={handleToggleUnlockBattery}
              />
            </div>
          </div>

          {/* 唤醒面板形态 */}
          <div className="quick-row" style={{ alignItems: 'center' }}>
            <div>
              <div className="sys-row-label">
                <span>Panel Behavior on Wake</span>
                <RevBadge variant="info">Window</RevBadge>
              </div>
              <div className="sys-row-desc">
                Choose which interface appears when opened from the tray or by double-clicking in the background. Remember the last state or lock a preferred mode.
              </div>
            </div>
            <div className="sys-row-controls">
              <div
                style={{
                  display: 'inline-flex',
                  gap: '4px',
                  background: 'var(--surface-overlay)',
                  padding: '3px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  className={`toggle-btn ${wakeWindowMode === 'remember' ? 'active-indigo' : ''}`}
                  onClick={() => handleUpdateWakeMode('remember')}
                  style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  title="Remember the last window layout (reopen the full panel or mini drawer, whichever was last used)."
                >
                  Remember Last Mode
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${wakeWindowMode === 'mini' ? 'active-indigo' : ''}`}
                  onClick={() => handleUpdateWakeMode('mini')}
                  style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  title="Always open the lightweight mini drawer in the bottom-right corner."
                >
                  Always Use Mini Drawer
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${wakeWindowMode === 'full' ? 'active-indigo' : ''}`}
                  onClick={() => handleUpdateWakeMode('full')}
                  style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  title="Always open the full 960×740 control panel, centered or at its remembered position."
                >
                  Always Use Full Panel
                </button>
              </div>
            </div>
          </div>

          {/* 迷你抽屉点击外部自动收起 */}
          <div className="quick-row" style={{ alignItems: 'center' }}>
            <div>
              <div className="sys-row-label">
                <span>Auto-collapse mini drawer on outside click</span>
                <RevBadge variant="info">Mini Drawer</RevBadge>
              </div>
              <div className="sys-row-desc">
                In mini-drawer mode, clicking the desktop or another app automatically collapses the drawer. The full panel is unaffected.
              </div>
            </div>
            <div className="sys-row-controls">
              <RevSwitch
                checked={miniAutoHide}
                onChange={handleToggleMiniAutoHide}
              />
            </div>
          </div>

          {/* 数据管理 */}
          <div className="quick-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="sys-row-label">Data Storage</div>
                <RevBadge variant={dataDirInfo?.mode === 'portable' ? 'success' : dataDirInfo?.mode === 'custom' ? 'warning' : 'accent'}>
                  {dataDirInfo?.mode === 'portable'
                    ? 'Portable directory (./data)'
                    : dataDirInfo?.mode === 'custom'
                      ? 'Custom path (data_dir.ptr)'
                      : 'Standard AppData (%APPDATA%)'}
                </RevBadge>
              </div>
              <div className="sys-row-desc" title={dataDirInfo?.path || ''}>
                {dataDirInfo?.path
                  ? `Current directory: ${dataDirInfo.path}`
                  : 'Manage persistent files such as user presets, keyboard effects, downloaded plugins, and skins'}
              </div>
            </div>
            <div className="sys-row-controls">
              <button
                onClick={handleOpenUserDataDir}
                className="toggle-btn"
                title="Open the current user data directory in File Explorer"
              >
                <FolderOpen size={12} />
                <span>Open Folder</span>
              </button>
              <button
                onClick={() => {
                  setMigrateTargetPath(dataDirInfo?.path || '');
                  setShowMigrateModal(true);
                }}
                className="toggle-btn"
                title="Move presets without data loss and create a redirect pointer"
              >
                <HardDrive size={12} />
                <span>Move Storage</span>
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="toggle-btn danger"
                title="Permanently clear all OpenRevo user data and presets"
              >
                <Trash2 size={12} />
                <span>Clear Data</span>
              </button>
            </div>
          </div>

          {/* 软件版本与自动更新 */}
          <div className="quick-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="sys-row-label">Version and Updates</div>
                <RevBadge variant="info">
                  {updateResult?.display_version || 'v0.9.5'}
                </RevBadge>
              </div>
              <div className="sys-row-desc">
                Smart parallel downloads from the official GitHub source and Gitee mirror. Supports installed and portable versions.
              </div>
            </div>
            <div className="sys-row-controls">
              <button
                onClick={() => handleCheckForUpdates(false)}
                disabled={checkingUpdate}
                className={`toggle-btn ${checkingUpdate ? 'active-indigo' : ''}`}
                title="Check GitHub and Gitee simultaneously for updates"
              >
                <RefreshCw size={12} className={checkingUpdate ? 'spin-icon' : ''} />
                <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
              </button>
            </div>
          </div>

          {/* Windows 基础电源方案 */}
          <div className="quick-row">
            <div>
              <div className="sys-row-label">
                <span>Windows Power Plans</span>
                <RevBadge variant="success">powercfg</RevBadge>
                {restorePlanMsg && (
                  <RevBadge variant={restorePlanMsg.includes('Failed') ? 'error' : 'success'}>
                    {restorePlanMsg}
                  </RevBadge>
                )}
              </div>
              <div className="sys-row-desc">
                System-level power plans. User-created undervolting and underclocking plans are preserved and can be switched at any time.
              </div>
            </div>
            <div className="sys-row-controls">
              <button
                onClick={() => setShowRestorePlanConfirm(true)}
                disabled={restoringPowerPlan}
                className="toggle-btn danger"
                style={{ padding: '4px 10px', fontSize: '11px', minWidth: 'auto' }}
                title="For Tongfang/Baolongda gaming laptops only: clear abnormal clock locks and idle heat, restoring factory balanced power settings and scheduling."
              >
                {restoringPowerPlan ? 'Repairing...' : 'Repair/Reset Plan'}
              </button>
              <select
                value={powerSchemes.find((s) => s.is_active)?.guid || ''}
                onChange={(e) => handleSwitchPowerScheme(e.target.value)}
                disabled={switchingScheme || restoringPowerPlan}
                className="rev-select"
                style={{ maxWidth: '190px' }}
              >
                {powerSchemes.map((s) => (
                  <option key={s.guid} value={s.guid}>
                    {s.name} {s.is_active ? '(Active)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchPowerSchemes}
                disabled={restoringPowerPlan}
                className="toggle-btn"
                style={{ padding: '4px 7px', minWidth: 'auto' }}
                title="Refresh Windows power plans"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          {/* 调试日志（仅在通过调试参数启动时可见） */}
          {logStatus.visible && (
            <>
              <div className="quick-row">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="sys-row-label">Runtime and error log level</div>
                    <RevBadge variant={logStatus.level === 2 ? 'accent' : 'success'}>
                      {logStatus.level === 2 ? 'All logs (verbose trace)' : 'Error logs (failures and crashes only)'}
                    </RevBadge>
                    {logStatus.level === 2 && (
                      <RevBadge
                        variant={logStatus.filter ? 'warning' : 'default'}
                        title={
                          logStatus.filter
                            ? `Showing only module logs matching [${logStatus.filter}] (high-frequency noise suppressed)`
                            : 'No filter set; showing all module logs'
                        }
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          {logStatus.filter
                            ? <><Crosshair size={10} /> Filter: {logStatus.filter}</>
                            : <><Globe size={10} /> All modules</>}
                        </span>
                      </RevBadge>
                    )}
                  </div>
                  <div className="sys-row-desc">
                    Started with debug flags. Click Disable and Hide when finished to save disk space.
                  </div>
                </div>
                <div className="sys-row-controls">
                  <button
                    onClick={() => handleSetLogLevel(logStatus.level === 2 ? 1 : 2)}
                    className={`toggle-btn ${logStatus.level === 2 ? 'active-indigo' : ''}`}
                    style={{ minWidth: '78px' }}
                  >
                    {logStatus.level === 2 ? 'Switch to error logs' : 'Switch to all logs'}
                  </button>
                  <button
                    onClick={handleOpenLog}
                    className="toggle-btn"
                    style={{ minWidth: '78px' }}
                    title={logStatus.path || 'Open Log File'}
                  >
                    View Logs
                  </button>
                  <button
                    onClick={() => handleSetLogLevel(0)}
                    className="toggle-btn"
                    style={{ minWidth: '65px', color: 'var(--text-dim)' }}
                    title="Disable logging and hide it from regular users"
                  >
                    Disable and Hide
                  </button>
                </div>
              </div>

              {/* 二级：模块精准过滤（仅 level==2 时展开） */}
              {logStatus.level === 2 && (
                <div
                  className="quick-row"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)', borderTop: '1px solid var(--border-subtle)' }}
                >
                  <div>
                    <div className="sys-row-label" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Diagnostic module filter (advanced option)
                    </div>
                    <div className="sys-row-desc">
                      Selecting a module suppresses thousands of high-frequency EC reads; command-line option:{' '}
                      <code style={{ color: 'var(--color-brand)' }}>--debug=module-name</code>
                    </div>
                  </div>
                  <div className="sys-chip-row">
                    {[
                      { label: 'All', value: null, Icon: Globe },
                      { label: 'External Liquid Cooler', value: 'cooler', Icon: Droplets },
                      { label: 'Custom Tracing', value: 'custom', Icon: Gauge },
                      { label: 'RGB and Streaming', value: 'light', Icon: Lightbulb },
                      { label: 'Power and Fans', value: 'power', Icon: Zap },
                      { label: 'Embedded Controller (EC)', value: 'ec', Icon: Cpu },
                      { label: 'Devices and Peripherals', value: 'device', Icon: Cable },
                      { label: 'Window and System', value: 'ui', Icon: Sliders },
                    ].map((item) => {
                      const isActive =
                        (!item.value && !logStatus.filter) ||
                        (item.value && logStatus.filter?.toLowerCase() === item.value);
                      const ItemIcon = item.Icon;
                      return (
                        <button
                          key={item.label}
                          onClick={() => handleSetLogFilter(item.value)}
                          className={`toggle-btn ${isActive ? 'active-indigo' : ''}`}
                          style={{ fontSize: '10px', padding: '2px 8px', minWidth: 'auto', borderRadius: 'var(--radius-xs)' }}
                        >
                          <ItemIcon size={11} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}



          {/* 只有在 --debug 模式下才显示的开发者形态预览卡片 */}
          {capabilities?.is_debug_mode && onPreviewFormFactor && (
            <div className="sys-card sys-card--highlight">
              <div className="sys-card-header">
                <div className="sys-card-title">
                  <Sliders className="sys-card-icon" />
                  <span>Live hardware profile and capability preview (Dev Mode)</span>
                </div>
                <RevBadge color="amber">--debug only</RevBadge>
              </div>
              <div className="sys-card-desc">
                Lets developers simulate hardware variants in the UI without changing low-level communication, such as ultrabooks without a discrete GPU or liquid cooler.
              </div>

              <div className="sys-rows">
                <div className="quick-row">
                  <div className="sys-row-label">
                    <span>Simulated Hardware Profile</span>
                    <span className="sys-row-desc">
                      {previewMode === 'real'
                        ? `Real hardware: ${capabilities.name || 'Adaptive'} (${capabilities.form_factor || 'gaming'})`
                        : previewMode === 'thin_light'
                          ? 'Simulated: Xingyao 14 Ultrabook (iGPU, no liquid cooler, monochrome backlight)'
                          : 'Simulated: Standard gaming laptop (dGPU direct, liquid cooling, all features)'}
                    </span>
                  </div>
                  <div className="sys-row-controls">
                    <button
                      className={`toggle-btn ${previewMode === 'real' ? 'active-emerald' : ''}`}
                      onClick={() => onPreviewFormFactor('real')}
                    >
                      Actual Device
                    </button>
                    <button
                      className={`toggle-btn ${previewMode === 'thin_light' ? 'active-cyan' : ''}`}
                      onClick={() => onPreviewFormFactor('thin_light')}
                    >
                      Xingyao 14 Ultrabook
                    </button>
                    <button
                      className={`toggle-btn ${previewMode === 'gaming' ? 'active-indigo' : ''}`}
                      onClick={() => onPreviewFormFactor('gaming')}
                    >
                      Gaming Laptop Profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 清除数据二次确认弹窗 */}
      {showClearConfirm && (
        <div
          className="sys-modal-backdrop"
          onClick={() => !clearingData && setShowClearConfirm(false)}
        >
          <div
            className="sys-modal-card danger"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sys-modal-header">
              <div className="sys-modal-icon-badge danger">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="sys-modal-title">Clear all user data?</div>
                <div className="sys-modal-subtitle">This will permanently clear the local user data directory.</div>
              </div>
            </div>

            <div className="sys-modal-body">
              <div className="sys-modal-warning-label">
                ⚠️ Warning: the following items will be permanently deleted:
              </div>
              <ul className="sys-modal-list">
                <li>User-created or modified mode and power presets</li>
                <li>Custom keyboard lighting effects, animation scripts, and presets</li>
                <li>Downloaded third-party plugins and custom skins</li>
                <li>Custom hardware profile names and mappings (models.json)</li>
              </ul>
            </div>

            <div className="sys-modal-actions">
              <button
                disabled={clearingData}
                onClick={() => setShowClearConfirm(false)}
                className="toggle-btn"
              >
                Cancel
              </button>
              <button
                disabled={clearingData}
                onClick={handleClearUserData}
                className="toggle-btn btn-danger-solid"
              >
                {clearingData ? 'Clearing...' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解除离电限制安全风险提示二次确认弹窗 */}
      {showUnlockBatteryConfirm && (
        <div
          className="sys-modal-backdrop"
          onClick={() => !togglingUnlockBattery && setShowUnlockBatteryConfirm(false)}
        >
          <div
            className="sys-modal-card danger"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sys-modal-header">
              <div className="sys-modal-icon-badge danger">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="sys-modal-title">Warning: Remove Battery-Power Restrictions</div>
                <div className="sys-modal-subtitle">Hardware power draw and battery safety information</div>
              </div>
            </div>

            <div className="sys-modal-body">
              <div className="sys-modal-warning-label">
                ⚠️ Factory firmware disables high-power modes on battery. Please understand the following risks:
              </div>
              <ul className="sys-modal-list">
                <li><strong>Battery overcurrent protection shutdown</strong>：Laptop batteries deliver much less peak power than the original adapter. Heavy loads on battery may trigger BMS overcurrent protection, causing sudden shutdowns or restarts.</li>
                <li><strong>Accelerated battery wear</strong>：Sustained high-rate discharge heats the battery and accelerates capacity degradation.</li>
                <li><strong>No forced downgrade on unplug</strong>：After unplugging the adapter, the system stays in Performance or Enthusiast mode instead of switching back to Balanced.</li>
                <li><strong>Recommended use</strong>：This can be useful for setting lower CPU/GPU power and thermal limits than Office mode to extend battery life. Do not run demanding 3D games or rendering workloads on battery.</li>
              </ul>
            </div>

            <div className="sys-modal-actions">
              <button
                disabled={togglingUnlockBattery}
                onClick={() => setShowUnlockBatteryConfirm(false)}
                className="toggle-btn"
              >
                Cancel
              </button>
              <button
                disabled={togglingUnlockBattery}
                onClick={handleConfirmUnlockBattery}
                className="toggle-btn btn-danger-solid"
              >
                {togglingUnlockBattery ? 'Enabling...' : 'I understand the risks; remove restrictions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 恢复官方出厂电源计划与 PPM 调度二次确认弹窗 */}
      {showRestorePlanConfirm && (
        <div
          className="sys-modal-backdrop"
          onClick={() => !restoringPowerPlan && setShowRestorePlanConfirm(false)}
        >
          <div
            className="sys-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sys-modal-header">
              <div className="sys-modal-icon-badge warning">
                <RotateCcw size={20} />
              </div>
              <div>
                <div className="sys-modal-title">Repair and restore factory power plans</div>
                <div className="sys-modal-subtitle">Match official control-center behavior and fix idle heat and abnormal clock limits</div>
              </div>
            </div>

            <div className="sys-modal-body">
              <div className="sys-modal-warning-label">
                💡 The following safety repairs will be performed to match factory defaults:
              </div>
              <ul className="sys-modal-list">
                <li><strong>Fix abnormal idle temperatures</strong>：Reset aggressive performance overlays and restore CPU core parking and deep Package C-states to eliminate 20W+ idle power draw.</li>
                <li><strong>Remove residual clock locks</strong>：Remove static frequency-limit keys (75b0ae3f) from all power plans to clear 0.8 GHz or 25 W clock-lock issues.</li>
                <li><strong>Reapply the official OEM provisioning package</strong>：Apply the factory PPM scheduling package for this hardware model (Baolongda AMD provisioning suite / Tongfang PPM policy package).</li>
                <li><strong>Activate the official Balanced plan</strong>：Switch back to the standard Windows Balanced plan. Your custom power plans will be preserved.</li>
              </ul>
            </div>

            <div className="sys-modal-actions">
              <button
                disabled={restoringPowerPlan}
                onClick={() => setShowRestorePlanConfirm(false)}
                className="toggle-btn"
              >
                Cancel
              </button>
              <button
                disabled={restoringPowerPlan}
                onClick={handleRestoreOfficialPowerPlan}
                className="toggle-btn active-indigo"
              >
                {restoringPowerPlan ? 'Repairing...' : 'Confirm Repair'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 迁移用户数据目录弹窗 */}
      {showMigrateModal && (
        <div
          className="sys-modal-backdrop"
          onClick={() => !migratingData && setShowMigrateModal(false)}
        >
          <div
            className="sys-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sys-modal-header">
              <div className="sys-modal-icon-badge info">
                <HardDrive size={20} />
              </div>
              <div>
                <div className="sys-modal-title">Move User Data Directory</div>
                <div className="sys-modal-subtitle">Move presets to a new path and redirect automatically</div>
              </div>
            </div>

            <div className="sys-modal-body">
              <div className="sys-modal-warning-label">
                💡 The app will copy all user data to the new directory without data loss and create a redirect pointer (data_dir.ptr) at the original location.
              </div>
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Absolute destination path (e.g. D:\OpenRevoData):
                </label>
                <input
                  type="text"
                  value={migrateTargetPath}
                  onChange={(e) => setMigrateTargetPath(e.target.value)}
                  disabled={migratingData}
                  placeholder="D:\OpenRevoData"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    background: 'var(--surface-overlay)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div className="sys-modal-actions">
              <button
                disabled={migratingData}
                onClick={() => setShowMigrateModal(false)}
                className="toggle-btn"
              >
                Cancel
              </button>
              <button
                disabled={migratingData || !migrateTargetPath.trim()}
                onClick={handleMigrateData}
                className="toggle-btn active-indigo"
              >
                {migratingData ? 'Moving...' : 'Confirm Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自动更新检测与安装弹窗 */}
      {showUpdateModal && updateResult && (
        <div
          className="sys-modal-backdrop"
          onClick={() => !downloadingUpdate && setShowUpdateModal(false)}
        >
          <div
            className="sys-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sys-modal-header">
              <div className="sys-modal-icon-badge info">
                <Download size={20} />
              </div>
              <div>
                <div className="sys-modal-title">
                  New version available: {updateResult.display_version || updateResult.latest_version}
                </div>
                <div className="sys-modal-subtitle">
                  Preferred download source: {updateResult.chosen_source === 'gitee' ? 'Gitee mirror (accelerated)' : updateResult.chosen_source === 'local_mock' ? 'Local test simulation' : 'Official GitHub source'} · Package type: {updateResult.asset_type === 'installer' ? 'Upgrade installed version' : 'Hot-reload portable build'}
                </div>
              </div>
            </div>

            <div className="sys-modal-body">
              <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Release notes and changelog:
              </div>
              <div className="updater-changelog-box">
                {updateResult.notes || 'No detailed release notes available.'}
              </div>

              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Package file: {updateResult.filename}</span>
                <span>Size: {(updateResult.size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>

              {downloadingUpdate && downloadProgress && (
                <div className="updater-progress-container">
                  <div className="updater-progress-bar-bg">
                    <div
                      className="updater-progress-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, downloadProgress.percentage))}%` }}
                    />
                  </div>
                  <div className="updater-progress-stats">
                    <span>
                      {(downloadProgress.downloaded / (1024 * 1024)).toFixed(2)} MB / {(downloadProgress.total / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span>
                      {(downloadProgress.speed_bytes_per_sec / (1024 * 1024)).toFixed(2)} MB/s ({downloadProgress.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="sys-modal-actions">
              <button
                disabled={downloadingUpdate}
                onClick={() => setShowUpdateModal(false)}
                className="toggle-btn"
              >
                Later
              </button>
              <button
                disabled={downloadingUpdate}
                onClick={handleDownloadAndInstall}
                className="toggle-btn active-indigo"
              >
                {downloadingUpdate ? 'Downloading update...' : 'Upgrade Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
