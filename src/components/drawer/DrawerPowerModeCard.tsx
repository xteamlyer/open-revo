import React, { useMemo } from 'react';
import { HardwareState, PowerMode } from '../../types/hardware';
import { ModelCapabilities } from '../../plugins/plugin_manifest';
import { Zap, Shield, Flame, Sliders } from 'lucide-react';

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

      <div className={hasCustomMode ? "m-grid-4" : "m-grid-3"}>
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
                title={isRestricted ? 'Unavailable on battery or limited power. Connect the original AC adapter.' : 'Performance Mode'}
                onClick={() => {
                  if (isRestricted) return;
                  checkOemGuard(() => onSetPowerMode(3));
                }}
              >
                <Flame size={14} />
                <span style={{ fontSize: '10.5px', fontWeight: 600 }}>
                  {isRestricted ? 'Performance (AC required)' : 'Performance'}
                </span>
              </button>

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
