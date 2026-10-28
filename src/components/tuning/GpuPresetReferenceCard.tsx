import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { HardwareState } from '../../types/hardware';

export interface GpuPresetReferenceCardProps {
  presets?: HardwareState['power_presets'];
  isDeclarative?: boolean;
}

export const GpuPresetReferenceCard: React.FC<GpuPresetReferenceCardProps> = ({ presets, isDeclarative }) => {
  return (
    <div
      className="tuning-sub-card"
      style={{
        marginTop: 'auto',
        padding: '10px 12px',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--status-warn)',
          whiteSpace: 'nowrap',
        }}
      >
        <AlertTriangle size={13} className="shrink-0" />
        <span>Factory-Recommended Power Limits</span>
        {presets?.hardware_read && (
          <span style={{ fontSize: '10px', color: 'var(--status-ok)', fontWeight: 600, marginLeft: 'auto' }}>
            {isDeclarative ? 'Direct factory hardware read' : 'Direct EC hardware read'}
          </span>
        )}
      </div>
      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
        {presets?.hardware_read ? (
          <>
            <div>
              • CPU 原厂预设: Office {presets.office_pl1}W / Balanced {presets.balance_pl1}W / Performance {presets.turbo_pl1}W
            </div>
            <div>
              • Factory GPU preset: base {presets.base_tgp}W + DB {presets.max_db}W (factory max {presets.base_tgp + presets.max_db}W)
            </div>
          </>
        ) : (
          <>
            <div>• CPU recommendation: sustained PL1 45–75W / boost PL2 75–115W</div>
            <div>• GPU recommendation: base TGP plus 15–25W dynamic boost</div>
          </>
        )}
      </div>
    </div>
  );
};
