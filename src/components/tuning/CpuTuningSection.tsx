import React from 'react';
import { Cpu } from 'lucide-react';
import { BiosMenuStatus } from '../../types/hardware';
import { CpuPlSliderRow } from './CpuPlSliderRow';
import { CpuBiosOcRow } from './CpuBiosOcRow';
import { HardwareTelemetryBar } from './HardwareTelemetryBar';

export interface CpuTuningSectionProps {
  cpuTemp: number;
  cpuFanRpm?: number;
  cpuPowerW?: number;
  gpuTemp?: number;
  gpuFanRpm?: number;
  gpuPowerW?: number;
  gpuName?: string;
  discreteGpu?: boolean;
  minPl: number;
  maxPl1: number;
  maxPl2: number;
  maxPl4: number;
  minMaxPl1?: number;
  maxMaxPl1?: number;
  minMaxPl2?: number;
  maxMaxPl2?: number;
  minMaxPl4?: number;
  maxMaxPl4?: number;
  onAdjustMaxPl1?: (delta: number) => void;
  onAdjustMaxPl2?: (delta: number) => void;
  onAdjustMaxPl4?: (delta: number) => void;
  tempTargetEnabled: boolean;
  tempTarget: number;
  tempTargetMin?: number;
  tempTargetMax?: number;
  maxTempWall?: number;
  onAdjustTempTargetMax?: (delta: number) => void;
  pl4Margin?: number;
  pl1: number;
  pl2: number;
  pl4: number;
  cpuVendor?: 'amd' | 'intel' | string;
  cpuTuningType?: 'intel_pl' | 'amd_smu' | 'none' | string;
  cpuSupportsFppt?: boolean;
  cpuName?: string;
  biosOcEnabled: boolean;
  biosStatus: BiosMenuStatus | null;
  biosToggling: boolean;
  onToggleTempTarget: (enabled: boolean) => void;
  onChangeTempTarget: (temp: number) => void;
  onChangePl1: (pl1: number) => void;
  onChangePl2: (pl2: number) => void;
  onChangePl4: (pl4: number) => void;
  onToggleBiosOc: () => void;
}

export const CpuTuningSection: React.FC<CpuTuningSectionProps> = ({
  cpuTemp,
  cpuFanRpm,
  cpuPowerW,
  gpuTemp,
  gpuFanRpm,
  gpuPowerW,
  discreteGpu,
  cpuVendor,
  cpuTuningType,
  cpuSupportsFppt = true,
  minPl,
  maxPl1,
  maxPl2,
  maxPl4,
  minMaxPl1,
  maxMaxPl1,
  minMaxPl2,
  maxMaxPl2,
  minMaxPl4,
  maxMaxPl4,
  onAdjustMaxPl1,
  onAdjustMaxPl2,
  onAdjustMaxPl4,
  tempTargetEnabled,
  tempTarget,
  tempTargetMin = 85,
  tempTargetMax = 95,
  maxTempWall = 100,
  onAdjustTempTargetMax,
  pl4Margin = 20,
  pl1,
  pl2,
  pl4,
  biosOcEnabled,
  biosStatus,
  biosToggling,
  onToggleTempTarget,
  onChangeTempTarget,
  onChangePl1,
  onChangePl2,
  onChangePl4,
  onToggleBiosOc,
}) => {
  const isApuOrIgpu = discreteGpu === false;

  const isAmdPlatform = React.useMemo(() => {
    return cpuVendor === 'amd' || cpuTuningType === 'amd_smu';
  }, [cpuVendor, cpuTuningType]);

  const isCpuTuningDisabled = cpuTuningType === 'none';

  return (
    <div className="tuning-card">
      {/* Header */}
      <div className="tuning-header">
        <div className="tuning-header-title" style={{ color: 'var(--color-balance)' }}>
          <Cpu className="w-4 h-4" />
          <span>{isAmdPlatform ? 'AMD CPU Power and Thermals' : 'CPU Power and Thermals'}</span>
        </div>
      </div>

      {/* Disabled Banner on Thin & Light Laptops */}
      {isCpuTuningDisabled && (
        <div
          className="sys-sub-panel"
          style={{
            padding: '8px 12px',
            marginBottom: '8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            color: 'var(--text-dim)',
            lineHeight: 1.4,
          }}
        >
          This ultrabook does not support custom CPU power or temperature limits. Power is managed automatically by the selected preset.
        </div>
      )}

      {/* Controls Container (dimmed & pointer-events disabled when tuning is unsupported) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          ...(isCpuTuningDisabled ? { opacity: 0.42, pointerEvents: 'none', filter: 'grayscale(0.7)' } : {}),
        }}
      >

        {/* Temperature Wall */}
        {(() => {
          const effectiveTempTarget = Math.min(tempTarget, tempTargetMax);
          return (
            <div className="tuning-row">
              <div className="tuning-row-header">
                <span className="tuning-row-label">
                  {isAmdPlatform ? 'Temperature Limit (TjMax):' : 'Temperature Limit:'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: tempTargetEnabled
                        ? effectiveTempTarget >= 100
                          ? 'var(--status-error)'
                          : effectiveTempTarget >= 96
                          ? 'var(--color-turbo)'
                          : 'var(--status-info)'
                        : 'var(--text-dim)',
                      fontSize: '11px',
                    }}
                    title={
                      effectiveTempTarget >= 100
                        ? '⚠️ High risk: settings above 100°C may trigger motherboard shutdown protection or the EC 55 W emergency power lock. Use the reset button in the top-right to recover if locked.'
                        : undefined
                    }
                  >
                    {tempTargetEnabled ? `${effectiveTempTarget}°C` : `${tempTargetMax}°C (No limit)`}
                    {tempTargetEnabled && effectiveTempTarget >= 100 && ' ⚠️'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleTempTarget(!tempTargetEnabled)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '10px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: tempTargetEnabled ? 'var(--status-info-dim)' : 'var(--surface-badge)',
                      color: tempTargetEnabled ? 'var(--status-info)' : 'var(--text-muted)',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {tempTargetEnabled ? 'Enabled' : 'Close'}
                  </button>
                </div>
              </div>

              {tempTargetEnabled && (
                <>
                  <div style={{ padding: '2px 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="range"
                      min={tempTargetMin}
                      max={tempTargetMax}
                      step="1"
                      value={effectiveTempTarget}
                      onChange={(e) => onChangeTempTarget(parseInt(e.target.value, 10))}
                      style={{
                        flex: 1,
                        accentColor:
                          effectiveTempTarget >= 100
                            ? 'var(--status-error)'
                            : effectiveTempTarget >= 96
                            ? 'var(--color-turbo)'
                            : 'var(--status-info)',
                        height: '7px',
                        cursor: 'pointer',
                      }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', minWidth: '40px', textAlign: 'right' }}>
                      {isAmdPlatform
                        ? (effectiveTempTarget < 95 ? `Throttle at -${95 - effectiveTempTarget}°C` : 'Maximum Performance')
                        : `Tcc-${Math.max(0, (tempTargetMax > maxTempWall ? tempTargetMax : maxTempWall) - effectiveTempTarget)}`}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '1px',
                      fontSize: '10px',
                      color: 'var(--text-dim)',
                    }}
                  >
                    <span>{tempTargetMin}°C</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Limit: {tempTargetMax}°C</span>
                      <button
                        type="button"
                        onClick={() => onAdjustTempTargetMax?.(-1)}
                        disabled={tempTargetMax <= tempTargetMin}
                        title="Decrease the temperature limit by 1°C"
                        className="tuning-step-btn"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdjustTempTargetMax?.(1)}
                        disabled={tempTargetMax >= maxTempWall}
                        title="Increase the temperature limit by 1°C"
                        className="tuning-step-btn"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

      {/* PL1 Long Duration / AMD SPL */}
      <CpuPlSliderRow
        label={isAmdPlatform ? 'Long-Term Sustained Power (SPL):' : 'Long-Term Power Limit (PL1):'}
        hint={isAmdPlatform ? 'PL1 Equivalent' : undefined}
        tooltip={isAmdPlatform ? 'AMD Sustained Power Limit (equivalent to Intel PL1)' : 'Intel Long Duration Power Limit (PL1)'}
        value={pl1}
        onChange={onChangePl1}
        min={minPl}
        max={maxPl1}
        minMax={minMaxPl1}
        maxMax={maxMaxPl1 ?? 260}
        onAdjustMax={onAdjustMaxPl1}
        colorVar="var(--color-balance)"
      />

      {/* PL2 Short Duration / AMD sPPT */}
      <CpuPlSliderRow
        label={isAmdPlatform ? 'Short-Term Boost Power (sPPT):' : 'Short-Term Power Limit (PL2):'}
        hint={isAmdPlatform ? 'PL2 Equivalent' : undefined}
        tooltip={isAmdPlatform ? 'AMD Slow Package Power Tracking (high-load boost, typically lasting 28 seconds; equivalent to Intel PL2)' : 'Intel Short Duration Power Limit (PL2)'}
        value={pl2}
        onChange={onChangePl2}
        min={minPl}
        max={maxPl2}
        minMax={minMaxPl2}
        maxMax={maxMaxPl2 ?? 260}
        onAdjustMax={onAdjustMaxPl2}
        colorVar="var(--color-brand)"
      />

      {/* PL4 Peak Power / AMD fPPT */}
      <CpuPlSliderRow
        label={isAmdPlatform ? 'Peak Boost (fPPT):' : 'Peak Power Limit (PL4):'}
        hint={isAmdPlatform ? (!cpuSupportsFppt ? 'Unavailable (managed by SPL)' : 'PL4 Equivalent') : undefined}
        tooltip={
          isAmdPlatform
            ? (!cpuSupportsFppt
                ? 'This motherboard firmware does not expose a separate fPPT register; SPL/sPPT jointly manages power control.'
                : 'AMD Fast Package Power Tracking (microsecond-scale peak current limit; equivalent to Intel PL4)')
            : 'Intel Peak Power Limit (PL4)'
        }
        disabled={isAmdPlatform && !cpuSupportsFppt}
        value={pl4}
        onChange={onChangePl4}
        min={minPl + pl4Margin}
        max={maxPl4}
        step={5}
        adjustStep={5}
        minMax={minMaxPl4 ?? (minPl + pl4Margin)}
        maxMax={maxMaxPl4 ?? 300}
        onAdjustMax={onAdjustMaxPl4}
        colorVar="var(--color-beast)"
      />

      {/* BIOS Advanced Switch */}
      <CpuBiosOcRow
        biosStatus={biosStatus}
        biosOcEnabled={biosOcEnabled}
        biosToggling={biosToggling}
        onToggleBiosOc={onToggleBiosOc}
      />
      </div>

      {/* Unified Real-Time Hardware Telemetry Monitor */}
      <HardwareTelemetryBar
        cpuTemp={cpuTemp}
        cpuFanRpm={cpuFanRpm}
        cpuPowerW={cpuPowerW}
        gpuTemp={gpuTemp}
        gpuFanRpm={gpuFanRpm}
        gpuPowerW={gpuPowerW}
        isApuOrIgpu={isApuOrIgpu}
      />
    </div>
  );
};
