import React from 'react';
import { Sparkles, ShieldCheck, Zap } from 'lucide-react';

interface CoolerPresetCardsProps {
  strategy?: string;
  liveMaxTemp: number;
  liveInterpolated: { duty: number; volt: number };
  onUpdateStrategy: (strategy: string) => void;
}

export const CoolerPresetCards: React.FC<CoolerPresetCardsProps> = ({
  strategy,
  liveMaxTemp,
  liveInterpolated,
  onUpdateStrategy,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
      <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Cooling Presets and Operating Mode</span>
        <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {strategy === 'custom' ? (
            <>
              <Sparkles size={11} style={{ color: 'var(--status-warn)' }} /> Manual custom control is active (no preset selected)
            </>
          ) : (
            'Choose Smart Adaptive for automatic control. Manual pump or fan adjustments switch to Custom mode.'
          )}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr 1fr', gap: '7px' }}>
        {/* 智慧自适应 */}
        <div
          onClick={() => onUpdateStrategy('smart')}
          className={`cooler-strat-card cooler-strat-smart ${strategy === 'smart' ? 'active' : ''}`}
          style={{
            background: strategy === 'smart' ? 'var(--status-info-dim)' : 'var(--surface-badge)',
            border: strategy === 'smart' ? '1px solid var(--status-info)' : '1px solid var(--border-subtle)',
            boxShadow: strategy === 'smart' ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 9px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            transition: 'all var(--transition-fast)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cooler-strat-title" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--status-info)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <ShieldCheck size={13} /> Smart Adaptive
            </span>
            <span
              className="cooler-strat-badge"
              style={{
                fontSize: '8px',
                fontWeight: 800,
                padding: '1px 4px',
                borderRadius: 'var(--radius-xs)',
                background: 'var(--status-info-dim)',
                color: 'var(--status-info)',
              }}
            >
              Thermal Tracking
            </span>
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            Dynamically controlled based on core temperature, <strong style={{ color: 'var(--status-ok)' }}>&lt;55°C fans stopped</strong>
          </div>
          <div className="cooler-strat-sub" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--status-info)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <Zap size={10} /> Following: {liveMaxTemp}°C → Fans {liveInterpolated.duty}% | Pump {
              liveInterpolated.volt >= 11 || liveInterpolated.volt === 3
                ? 'Extreme Performance'
                : liveInterpolated.volt === 0
                ? 'Stop'
                : 'Standard cruise'
            }
          </div>
        </div>

        {/* 静音策略 */}
        <div
          onClick={() => onUpdateStrategy('quiet')}
          className={`cooler-strat-card cooler-strat-quiet ${strategy === 'quiet' ? 'active' : ''}`}
          style={{
            background: strategy === 'quiet' ? 'var(--status-info-dim)' : 'var(--surface-badge)',
            border: strategy === 'quiet' ? '1px solid var(--status-info)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 9px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            transition: 'all var(--transition-fast)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cooler-strat-title" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--status-info)' }}>Silent Strategy</span>
            <span className="cooler-strat-badge" style={{ fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: 'var(--radius-xs)', background: 'var(--surface-pill)', color: 'var(--text-muted)' }}>固定</span>
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>标准巡航水泵 + 40% Fans</div>
          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '1px' }}>Ideal for quiet nighttime use</div>
        </div>

        {/* 均衡策略 */}
        <div
          onClick={() => onUpdateStrategy('balance')}
          className={`cooler-strat-card cooler-strat-balance ${strategy === 'balance' ? 'active' : ''}`}
          style={{
            background: strategy === 'balance' ? 'var(--border-glow)' : 'var(--surface-badge)',
            border: strategy === 'balance' ? '1px solid var(--color-brand)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 9px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            transition: 'all var(--transition-fast)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cooler-strat-title" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-brand)' }}>Balanced Strategy</span>
            <span className="cooler-strat-badge" style={{ fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: 'var(--radius-xs)', background: 'var(--surface-pill)', color: 'var(--text-muted)' }}>固定</span>
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>标准巡航水泵 + 65% Fans</div>
          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '1px' }}>Balances cooling and fan noise</div>
        </div>

        {/* 极速狂暴 */}
        <div
          onClick={() => onUpdateStrategy('performance')}
          className={`cooler-strat-card cooler-strat-perf ${strategy === 'performance' ? 'active' : ''}`}
          style={{
            background: strategy === 'performance' ? 'var(--status-error-dim)' : 'var(--surface-badge)',
            border: strategy === 'performance' ? '1px solid var(--status-error)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 9px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            transition: 'all var(--transition-fast)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cooler-strat-title" style={{ fontSize: '11px', fontWeight: 800, color: 'var(--status-error)' }}>Maximum Performance</span>
            <span className="cooler-strat-badge" style={{ fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: 'var(--radius-xs)', background: 'var(--status-error-dim)', color: 'var(--status-error)' }}>Maximum Performance</span>
          </div>
          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>极限狂暴水泵 + 100% Fans</div>
          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '1px' }}>Maximizes cooling performance</div>
        </div>
      </div>
    </div>
  );
};
