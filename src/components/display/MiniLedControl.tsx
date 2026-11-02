import React from 'react';
import { Layers } from 'lucide-react';

export interface MiniLedControlProps {
  enabled: boolean;
  isToggling: boolean;
  onToggle: (nextVal: boolean) => void;
}

/**
 * MiniLedControl — 内置屏幕分区背光 (MiniLED Local Dimming) 控制行
 * 遵循 OpenRevo Design System 规范与 Mono 黑白主题全量适配。
 */
export const MiniLedControl: React.FC<MiniLedControlProps> = ({
  enabled,
  isToggling,
  onToggle,
}) => {
  return (
    <div className="glass-card miniled-control-card">
      {/* Left: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div className={`miniled-icon-badge ${enabled ? 'active' : ''}`}>
          <Layers className="w-4 h-4" />
        </div>
        <div>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Built-in Display Zone Backlight (MiniLED Local Dimming)
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>
            {enabled
              ? 'Current state: On (deep-black high contrast; built-in display only)'
              : 'Current state: Off (uniform full-screen backlight)'}
          </div>
        </div>
      </div>

      {/* Right: toggle switch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <button
          onClick={() => onToggle(!enabled)}
          disabled={isToggling}
          className={`miniled-toggle-switch ${enabled ? 'active' : ''}`}
          title={enabled ? 'Disable MiniLED zone backlighting' : 'Enable MiniLED zone backlighting'}
          aria-label="Toggle MiniLED zone backlighting"
        >
          <div className="miniled-toggle-knob" />
        </button>
      </div>
    </div>
  );
};
