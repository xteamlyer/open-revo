import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { HardwareState, PowerMode } from '../../types/hardware';
import { ModelCapabilities } from '../../plugins/plugin_manifest';
import { useTurboSubmode } from '../../hooks/useTurboSubmode';
import { Zap, Shield, Flame, Sliders, Snowflake } from 'lucide-react';

interface DrawerPowerModeCardProps {
  status: HardwareState;
  capabilities?: ModelCapabilities;
  onSetPowerMode: (mode: PowerMode) => void;
  checkOemGuard: (action: () => void) => void;
  onExpandDashboard: (tab?: 'overview' | 'gpu' | 'tuning' | 'lighting' | 'water' | 'system' | 'sponsor' | 'custom_tuning') => void;
}

export const DrawerPowerModeCard: React.FC<DrawerPowerModeCardProps> = ({
  status,
  capabilities,
  onSetPowerMode,
  checkOemGuard,
  onExpandDashboard,
}) => {
  const isThinLight = capabilities?.form_factor === 'thin_light' || capabilities?.discrete_gpu === false;
  const hasCustomMode = capabilities?.power_modes ? capabilities.power_modes.includes('custom') : !isThinLight;
  const [gpuOc, setGpuOc] = useState<{ on: boolean; busy: boolean; error: boolean }>({ on: false, busy: false, error: false });
  const [ocDefaults, setOcDefaults] = useState<{ core: number; mem: number }>({ core: 105, mem: 500 });

  useEffect(() => {
    invoke<any>('get_app_config')
      .then((cfg) => {
        if (!cfg) return;
        const core = Number(cfg.gpu_oc_core_mhz);
        const mem = Number(cfg.gpu_oc_mem_mhz);
        setOcDefaults({
          core: Number.isFinite(core) && core >= 0 ? core : 105,
          mem: Number.isFinite(mem) && mem >= 0 ? mem : 500,
        });
      })
      .catch(() => { });
  }, []);
  // 狂暴子模式（静音/高能）：只有能力位满足的机型才显示入口
  const turboSub = useTurboSubmode();

  // OC 状态：初始查一次 + 跟随 gpu-clock-offsets-changed（大窗口/宿主复位时同步）
  useEffect(() => {
    let alive = true;
    const fromOffsets = (core: number, mem: number) => {
      if (!alive) return;
      setGpuOc((s) => ({ ...s, on: core !== 0 || mem !== 0 }));
    };
    invoke<any>('get_gpu_oc_state')
      .then((v) => { if (Array.isArray(v)) fromOffsets(Number(v[0]) || 0, Number(v[1]) || 0); })
      .catch(() => { });
    let unlisten: any = null;
    listen('gpu-clock-offsets-changed', (e: any) => {
      const p = (e && e.payload) || {};
      fromOffsets(Number(p.core_offset_mhz) || 0, Number(p.mem_offset_mhz) || 0);
    })
      .then((f) => { unlisten = f; })
      .catch(() => { });
    return () => {
      alive = false;
      try { if (unlisten) unlisten(); } catch { /* ignore */ }
    };
  }, []);

  // 静音/高能 分段按钮：单次 IPC 由后端确保进入狂暴档并应用子模式
  const applyTurboSeg = (silent: boolean) => {
    checkOemGuard(() => { void turboSub.apply(silent); });
  };

  // OC 开关：文字固定 OC，开=高亮，关=普通；只跟随当前激活的狂暴子模式按钮显示
  const renderOcChip = (restricted: boolean) => {
    if (status.power_mode !== 3 || restricted) return null;
    return (
      <button
        className={`gpu-oc-chip${gpuOc.on ? ' is-applied' : ''}${gpuOc.error ? ' is-error' : ''}`}
        title={gpuOc.on
          ? `GPU OC on (core +${ocDefaults.core} MHz / memory +${ocDefaults.mem} MHz) — click to turn off`
          : `GPU OC off — click to turn on (core +${ocDefaults.core} MHz / memory +${ocDefaults.mem} MHz)`}
        onClick={async (e) => {
          e.stopPropagation();
          if (gpuOc.busy) return;
          const next = !gpuOc.on;
          setGpuOc((s) => ({ ...s, busy: true, error: false }));
          try {
            const cfg: any = await invoke('get_app_config').catch(() => null);
            const cfgCore = Number(cfg?.gpu_oc_core_mhz);
            const cfgMem = Number(cfg?.gpu_oc_mem_mhz);
            const core = Number.isFinite(cfgCore) && cfgCore >= 0 ? cfgCore : ocDefaults.core;
            const mem = Number.isFinite(cfgMem) && cfgMem >= 0 ? cfgMem : ocDefaults.mem;
            await invoke('apply_gpu_oc', { coreMhz: next ? core : 0, memMhz: next ? mem : 0 });
            setGpuOc({ on: next, busy: false, error: false });
          } catch (err) {
            console.warn('[DrawerPowerModeCard] toggle gpu oc failed:', err);
            setGpuOc((s) => ({ ...s, busy: false, error: true }));
          }
        }}
      >
        OC
      </button>
    );
  };

  // Current power mode description
  const modeDesc = useMemo(() => {
    switch (status.power_mode) {
      case 1:
        return 'Office Mode';
      case 2:
        return 'Balanced Mode';
      case 3:
        return 'Performance Mode';
      case 4:
        return hasCustomMode ? 'Enthusiast Custom Tuning' : 'Balanced Mode';
      default:
        return 'Balanced Mode';
    }
  }, [status.power_mode, hasCustomMode]);

  return (
    <div className="m-card">
      <div className="m-card-header">
        <div className="m-header-left">
          <Zap size={13} style={{ color: 'var(--theme-pwr)' }} />
          <span>Performance Mode:</span>
          <span style={{ color: 'var(--theme-pwr)', fontWeight: 700 }}>{modeDesc}</span>
        </div>
        <div className="m-header-right" style={{ color: 'var(--theme-pwr)' }}>
          CPU: {status.cpu_temp > 0 ? `${status.cpu_temp}°C` : '--'} · Fan: {status.cpu_fan_rpm > 0 ? `${status.cpu_fan_rpm} RPM` : 'Silent'}
        </div>
      </div>

      <div className={turboSub.supported ? 'm-pwr-row' : (hasCustomMode ? 'm-grid-4' : 'm-grid-3')}>
        <button
          className="m-btn-action"
          style={
            status.power_mode === 1
              ? {
                background: 'var(--theme-pwr-dim)',
                borderColor: 'var(--theme-pwr-border)',
                color: 'var(--theme-pwr)',
                boxShadow: '0 0 12px var(--theme-pwr-glow)',
              }
              : {}
          }
          onClick={() => checkOemGuard(() => onSetPowerMode(1))}
        >
          <Shield size={14} />
          <span style={{ fontSize: '10.5px', fontWeight: 600 }}>Office</span>
        </button>

        <button
          className="m-btn-action"
          style={
            status.power_mode === 2
              ? {
                background: 'var(--theme-pwr-dim)',
                borderColor: 'var(--theme-pwr-border)',
                color: 'var(--theme-pwr)',
                boxShadow: '0 0 12px var(--theme-pwr-glow)',
              }
              : {}
          }
          onClick={() => checkOemGuard(() => onSetPowerMode(2))}
        >
          <Zap size={14} />
          <span style={{ fontSize: '10.5px', fontWeight: 600 }}>Balanced</span>
        </button>

        {(() => {
          const isRestricted = !isThinLight && status.is_dc_online === false && !status.unlock_battery_power_limit;
          return (
            <>
            <div className="gpu-oc-wrap">
              {turboSub.supported ? (
                <div className="turbo-seg">
                  <button
                    className={`m-btn-action turbo-seg-item${status.power_mode === 3 && turboSub.silent ? ' active' : ''}`}
                    disabled={isRestricted || turboSub.busy}
                    title={isRestricted ? '电池供电或受限供电下不可用，需接入原装电源适配器' : '静音狂暴：狂暴档内的安静子模式'}
                    onClick={() => { if (!isRestricted) applyTurboSeg(true); }}
                  >
                    {status.power_mode === 3 && turboSub.silent && renderOcChip(isRestricted)}
                    <Snowflake size={14} />
                    <span style={{ fontSize: '9.5px', fontWeight: 600 }}>
                      {isRestricted ? 'Silent' : 'Silent Beast'}
                    </span>
                  </button>
                  <button
                    className={`m-btn-action turbo-seg-item${status.power_mode === 3 && !turboSub.silent ? ' active' : ''}`}
                    disabled={isRestricted || turboSub.busy}
                    title={isRestricted ? '电池供电或受限供电下不可用，需接入原装电源适配器' : '高能狂暴：狂暴档内的高能/极限子模式'}
                    onClick={() => { if (!isRestricted) applyTurboSeg(false); }}
                  >
                    {status.power_mode === 3 && !turboSub.silent && renderOcChip(isRestricted)}
                    <Flame size={14} />
                    <span style={{ fontSize: '9.5px', fontWeight: 600 }}>
                      {isRestricted ? 'Extreme' : 'Extreme Beast'}
                    </span>
                  </button>
                  {turboSub.error && (
                    <div role="alert" style={{ fontSize: '10px', color: 'var(--theme-pwr)' }}>{turboSub.error}</div>
                  )}
                </div>
              ) : (
                <button
                  className="m-btn-action"
                  disabled={isRestricted}
                  style={{
                    ...(status.power_mode === 3
                      ? {
                        background: 'var(--theme-pwr-dim)',
                        borderColor: 'var(--theme-pwr-border)',
                        color: 'var(--theme-pwr)',
                        boxShadow: '0 0 12px var(--theme-pwr-glow)',
                      }
                      : {}),
                    ...(isRestricted
                      ? {
                        opacity: 0.45,
                        cursor: 'not-allowed',
                        filter: 'grayscale(0.6)',
                      }
                      : {}),
                  }}
                  title={isRestricted ? 'Not available on battery or restricted power; please connect the factory power adapter' : 'Beast mode'}
                  onClick={() => {
                    if (isRestricted) return;
                    checkOemGuard(() => onSetPowerMode(3));
                  }}
                >
                  {renderOcChip(isRestricted)}
                  <Flame size={14} />
                  <span style={{ fontSize: '10.5px', fontWeight: 600 }}>
                    {isRestricted ? 'Beast (needs AC)' : 'Beast'}
                  </span>
                </button>
              )}
                </div>

              {hasCustomMode && (
                <button
                  className="m-btn-action"
                  disabled={isRestricted}
                  style={{
                    ...(status.power_mode === 4
                      ? {
                        background: 'var(--theme-pwr-dim)',
                        borderColor: 'var(--theme-pwr-border)',
                        color: 'var(--theme-pwr)',
                        boxShadow: '0 0 12px var(--theme-pwr-glow)',
                      }
                      : {}),
                    ...(isRestricted
                      ? {
                        opacity: 0.45,
                        cursor: 'not-allowed',
                        filter: 'grayscale(0.6)',
                      }
                      : {}),
                  }}
                  title={
                    isRestricted
                      ? 'Unavailable on battery or limited power. Connect the original AC adapter.'
                      : status.power_mode === 4
                      ? 'Enthusiast mode is active. Click again to open advanced tuning.'
                      : 'Switch to Enthusiast Custom Mode'
                  }
                  onClick={() => {
                    if (isRestricted) return;
                    checkOemGuard(() => {
                      if (status.power_mode === 4) {
                        onExpandDashboard('custom_tuning');
                      } else {
                        onSetPowerMode(4);
                      }
                    });
                  }}
                >
                  <Sliders size={14} />
                  <span style={{ fontSize: '10.5px', fontWeight: 600 }}>
                    {isRestricted ? 'Enthusiast (AC required)' : 'Enthusiast Tuning'}
                  </span>
                </button>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
};
