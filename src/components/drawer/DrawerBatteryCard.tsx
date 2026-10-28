import React from 'react';
import { HardwareState } from '../../types/hardware';
import { Battery } from 'lucide-react';

interface DrawerBatteryCardProps {
  status: HardwareState;
  onToggleBatteryLimit: (limit?: number) => void;
  checkOemGuard: (action: () => void) => void;
  onExpandDashboard?: (tab?: 'overview' | 'gpu' | 'tuning' | 'lighting' | 'water' | 'system' | 'sponsor' | 'custom_tuning') => void;
}

export const DrawerBatteryCard: React.FC<DrawerBatteryCardProps> = ({
  status,
  onToggleBatteryLimit,
  checkOemGuard,
  onExpandDashboard: _onExpandDashboard,
}) => {
  return (
    <div className="m-card">
      <div className="m-card-header">
        <div className="m-header-left">
          <Battery size={13} style={{ color: 'var(--theme-bat)' }} />
          <span>Battery Health:</span>
          <span style={{ color: 'var(--theme-bat)', fontWeight: 700 }}>
            {status.battery_limit === 60
              ? 'Workstation Mode'
              : status.battery_limit === 80
              ? 'Balanced Mode'
              : 'Long-Life Mode'}
          </span>
        </div>
        <div className="m-header-right" style={{ color: 'var(--theme-bat)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: status.is_dc_online ? '#34d399' : '#fbbf24' }} />
          {status.is_dc_online ? 'AC Connected' : 'Battery power'}
        </div>
      </div>

      <div className="m-grid-3">
        <button
          className="m-btn-bat"
          style={
            status.battery_limit === 60
              ? {
                background: 'var(--theme-bat-dim)',
                borderColor: 'var(--theme-bat-border)',
                color: 'var(--theme-bat)',
                boxShadow: '0 0 10px var(--theme-bat-glow)',
                fontWeight: 700,
              }
              : {}
          }
          title="Workstation Mode (60% limit)"
          onClick={() => checkOemGuard(() => onToggleBatteryLimit(60))}
        >
          Workstation
        </button>

        <button
          className="m-btn-bat"
          style={
            status.battery_limit === 80
              ? {
                background: 'var(--theme-bat-dim)',
                borderColor: 'var(--theme-bat-border)',
                color: 'var(--theme-bat)',
                boxShadow: '0 0 10px var(--theme-bat-glow)',
                fontWeight: 700,
              }
              : {}
          }
          title="Balanced Mode (80% limit)"
          onClick={() => checkOemGuard(() => onToggleBatteryLimit(80))}
        >
          Balanced
        </button>

        <button
          className="m-btn-bat"
          style={
            status.battery_limit === 100
              ? {
                background: 'var(--theme-bat-dim)',
                borderColor: 'var(--theme-bat-border)',
                color: 'var(--theme-bat)',
                boxShadow: '0 0 10px var(--theme-bat-glow)',
                fontWeight: 700,
              }
              : {}
          }
          title="Long-Life Mode (100% 充满)"
          onClick={() => checkOemGuard(() => onToggleBatteryLimit(100))}
        >
          Longevity
        </button>
      </div>
    </div>
  );
};
