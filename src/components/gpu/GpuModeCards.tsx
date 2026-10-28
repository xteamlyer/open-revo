import React from 'react';
import {
  Cpu,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Zap,
  Layers,
  PowerOff,
  Clock,
  X,
  ArrowRight,
} from 'lucide-react';
import { GpuCapabilities } from '../GpuModeView';
import { formatGpuShort, formatCpuShort } from './gpuUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GpuModeInfo {
  current_mode: string;
  has_igpu_present: boolean;
  has_dgpu?: boolean;
  gpu_name: string;
  platform?: string;
  cpu_name?: string;
  hardware_read?: boolean;
  error?: string | null;
  capabilities?: GpuCapabilities;
}

export interface PendingSwitch {
  targetMode: 'dgpu' | 'hybrid' | 'igpu';
  targetTitle: string;
  targetHex: string;
  currentTitle: string;
  currentHex: string;
}

export interface NoticeState {
  type: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const NoticeBanner: React.FC<{ notice: NoticeState; onClose: () => void }> = ({ notice, onClose }) => {
  const colorMap = {
    error:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   text: '#f87171' },
    warning: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)', text: '#fbbf24' },
    success: { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)', text: '#34d399' },
    info:    { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)', text: '#60a5fa' },
  };
  const c = colorMap[notice.type];
  return (
    <div
      style={{
        padding: '10px 14px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        fontSize: '11px',
        color: c.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {notice.type === 'success'
          ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
        <div style={{ lineHeight: '1.4' }}>{notice.text}</div>
      </div>
      <button
        onClick={onClose}
        style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
      >
        <X className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
      </button>
    </div>
  );
};

// ─── Main export ──────────────────────────────────────────────────────────────

export interface GpuModeCardsProps {
  gpuInfo: GpuModeInfo;
  loading: boolean;
  rebooting: boolean;
  notice: NoticeState | null;
  pendingSwitch: PendingSwitch | null;
  onCardClick: (mode: 'dgpu' | 'hybrid' | 'igpu') => void;
  onConfirmSwitch: (restartImmediately: boolean) => void;
  onCancelSwitch: () => void;
  onDismissNotice: () => void;
  onUnlockGeekIgpu?: (unlock: boolean) => void;
}

/**
 * GpuModeCards — 显卡模式三卡选择器 + 切换确认弹层。
 * 插件化路径：此组件未来可作为独立"显卡管理插件"的核心视图插槽。
 */
export const GpuModeCards: React.FC<GpuModeCardsProps> = ({
  gpuInfo,
  loading,
  rebooting,
  notice,
  pendingSwitch,
  onCardClick,
  onConfirmSwitch,
  onCancelSwitch,
  onDismissNotice,
  onUnlockGeekIgpu,
}) => {
  const hasPhysicalDgpu = gpuInfo.has_dgpu === true;
  const supportsMuxSwitch = hasPhysicalDgpu && (gpuInfo.capabilities?.supports_dgpu === true || gpuInfo.capabilities?.supports_igpu_only === true);
  const hasDgpu = supportsMuxSwitch;
  const isSafetyLocked = gpuInfo.capabilities?.is_safety_locked === true;
  const isUserUnlocked = gpuInfo.capabilities?.user_unlocked === true;
  const isTriModeSupported = isSafetyLocked
    ? isUserUnlocked
    : (gpuInfo.capabilities ? gpuInfo.capabilities.supports_igpu_only : true);
  const isIntel = gpuInfo.platform !== 'amd';

  const [showGeekUnlockModal, setShowGeekUnlockModal] = React.useState(false);
  const [geekConfirmedRisk, setGeekConfirmedRisk] = React.useState(false);

  const handleInternalCardClick = (mode: 'dgpu' | 'hybrid' | 'igpu') => {
    if (mode === 'igpu' && isSafetyLocked && !isUserUnlocked) {
      setShowGeekUnlockModal(true);
      return;
    }
    onCardClick(mode);
  };

  // ─── Card renderer ────────────────────────────────────────────────────────

  const renderCard = (
    mode: 'dgpu' | 'hybrid' | 'igpu',
    opts: {
      accentColor: string;
      accentRgb: string;
      iconColor: string;
      iconEl: React.ReactNode;
      chipLabel: string;
      desc: string;
      titleText: string;
      isActive: boolean;
      isDisabled: boolean;
      disabledBadge?: React.ReactNode;
      activeBadgeColor: string;
      activeBadgeText: string;
    }
  ) => {
    const { accentRgb, iconColor, iconEl, chipLabel, desc, titleText, isActive, isDisabled, disabledBadge, activeBadgeColor, activeBadgeText } = opts;
    return (
      <div
        onClick={() => handleInternalCardClick(mode)}
        className={`glass-card gpu-mode-card ${isActive ? `active active-${mode}` : ''}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          minHeight: '175px',
          cursor: loading || isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.38 : 1,
          filter: isDisabled ? 'grayscale(0.6)' : 'none',
          transition: 'all 0.25s ease',
          position: 'relative',
          background: isActive
            ? `linear-gradient(180deg, rgba(${accentRgb}, 0.18) 0%, rgba(30,41,59,0.6) 100%)`
            : 'rgba(255,255,255,0.03)',
          borderColor: isActive ? `rgba(${accentRgb}, 0.7)` : 'var(--glass-border)',
          boxShadow: isActive ? `0 0 22px rgba(${accentRgb}, 0.3)` : 'none',
        }}
      >
        {/* Active badge */}
        {isActive && (
          <div
            className="gpu-mode-active-badge"
            style={{
              position: 'absolute', top: '10px', right: '10px',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '9px', fontWeight: 700,
              color: activeBadgeColor,
              background: `${activeBadgeColor}26`,
              padding: '2px 7px', borderRadius: '4px',
              border: `1px solid ${activeBadgeColor}4d`,
            }}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{activeBadgeText}</span>
          </div>
        )}

        {/* Disabled / locked badge */}
        {!isActive && disabledBadge}

        {/* No-dgpu badge (for dgpu/hybrid cards when no dedicated gpu) */}
        {!hasDgpu && mode !== 'igpu' && (
          <div
            style={{
              position: 'absolute', top: '10px', right: '10px',
              fontSize: '9px', fontWeight: 700,
              color: 'var(--text-muted)',
              background: 'rgba(148,163,184,0.12)',
              padding: '2px 7px', borderRadius: '4px',
              border: '1px solid rgba(148,163,184,0.25)',
            }}
          >
            <span>No Discrete GPU Hardware</span>
          </div>
        )}

        {/* IC chip graphic */}
        <div
          style={{
            width: '52px', height: '52px',
            border: `2px dashed ${iconColor}`,
            borderRadius: '8px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15,23,42,0.7)',
            marginTop: '4px',
          }}
        >
          {iconEl}
          <span style={{ fontSize: '10px', fontWeight: 900, color: iconColor, letterSpacing: '0.08em' }}>
            {chipLabel}
          </span>
        </div>

        {/* Description */}
        <div style={{ textAlign: 'center', margin: '8px 0 6px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.35' }}>
            {desc}
          </p>
        </div>

        {/* Title */}
        <span
          className="gpu-mode-title"
          style={{
            fontSize: '14px', fontWeight: 800, letterSpacing: '0.05em',
            color: isActive ? iconColor : (isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)'),
          }}
        >
          {titleText}
        </span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', userSelect: 'none', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.03em', margin: 0, color: 'var(--text-primary)' }}>
              {hasDgpu
                ? (isTriModeSupported ? 'GPU Mode (Triple Graphics Mode)' : 'GPU Mode (Hybrid Graphics)')
                : (hasPhysicalDgpu ? 'GPU Architecture (Discrete + Hybrid Graphics)' : 'GPU Architecture (Integrated-Only Ultrabook)')}
            </h2>
          </div>
          <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            {hasDgpu
              ? (isTriModeSupported
                  ? 'Hardware-level MUX switching reconfigures PCIe buses and physical display connections during BIOS POST.'
                  : 'This model supports discrete-only and hybrid graphics. The hardware safety lock is enabled to prevent a black screen.')
              : (hasPhysicalDgpu
                  ? 'This device uses NVIDIA Optimus hybrid graphics. The internal display is driven by the iGPU, while the discrete GPU accelerates demanding 3D workloads.'
                  : 'This efficient integrated-only design uses CPU graphics directly for low power consumption and excellent battery life. No MUX switch is needed.')}
          </p>
        </div>

        {/* Chip badge */}
        <div
          className="gpu-chip-badge"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: hasPhysicalDgpu ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
            border: hasPhysicalDgpu ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(16,185,129,0.3)',
            padding: '4px 8px', borderRadius: '6px',
          }}
        >
          <Cpu className={`w-3.5 h-3.5 ${hasPhysicalDgpu ? 'text-indigo-400' : 'text-emerald-400'} gpu-chip-icon`} />
          <span
            className="gpu-chip-text"
            style={{ fontSize: '10.5px', fontWeight: 700, color: hasPhysicalDgpu ? '#c7d2fe' : '#a7f3d0', letterSpacing: '0.02em' }}
          >
            {formatGpuShort(gpuInfo.gpu_name, hasPhysicalDgpu)} · {formatCpuShort(gpuInfo.cpu_name)}
          </span>
        </div>
      </div>

      {/* Architecture banner */}
      <div
        className="glass-card"
        style={{
          position: 'relative', overflow: 'hidden', padding: '8px 16px',
          background: 'linear-gradient(135deg, rgba(30,41,59,0.7), rgba(15,23,42,0.8))',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '52px',
        }}
      >
        <div style={{ zIndex: 2, maxWidth: '75%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.03em' }}>
              {hasDgpu
                ? (isTriModeSupported ? 'Native motherboard hardware MUX switching' : 'Dual-GPU hardware safety architecture')
                : (hasPhysicalDgpu ? 'NVIDIA Optimus Dynamic Hybrid Graphics' : 'Efficient Integrated-Only Ultrabook (iGPU Only)')}
            </h3>
            <span style={{ fontSize: '10px', color: isIntel ? '#60a5fa' : '#fb923c', fontWeight: 700 }}>
              [{isIntel ? 'Intel' : 'AMD'} Platform Architecture]
            </span>
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {hasDgpu ? (
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Physical Hardware Reconfiguration:</span>
                Reconfigures PCIe lanes and physical display routing during self-test to prevent driver crashes, frame drops, and stutter.
              </div>
            ) : hasPhysicalDgpu ? (
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Dynamic Hybrid Graphics:</span>
                Quiet, power-efficient iGPU operation under light loads; the discrete GPU accelerates demanding workloads automatically. No physical MUX switch or manual reboot is needed.
              </div>
            ) : (
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Native Integrated Graphics:</span>
                Graphics and display output are handled by the CPU’s efficient integrated GPU. Physical MUX switching is unnecessary and unsupported.
              </div>
            )}
          </div>
        </div>

        <div
          className="gpu-mux-graphic"
          style={{
            height: '38px', padding: '0 12px',
            background: hasPhysicalDgpu
              ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.25))'
              : 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.2))',
            borderRadius: '8px',
            border: hasPhysicalDgpu ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(16,185,129,0.35)',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: hasPhysicalDgpu ? '0 0 14px rgba(59,130,246,0.12)' : '0 0 14px rgba(16,185,129,0.12)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '26px', height: '26px',
              border: hasPhysicalDgpu ? '1.5px solid rgba(147,197,253,0.8)' : '1.5px solid rgba(52,211,153,0.8)',
              borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(15,23,42,0.8)',
            }}
          >
            {hasPhysicalDgpu
              ? <ShieldCheck className="w-3.5 h-3.5 text-blue-400 gpu-mux-icon" />
              : <Cpu className="w-3.5 h-3.5 text-emerald-400 gpu-mux-icon" />}
          </div>
          <span
            className="gpu-mux-text"
            style={{ fontSize: '9px', fontWeight: 700, color: hasPhysicalDgpu ? '#93c5fd' : '#6ee7b7', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}
          >
            {hasDgpu ? 'HARDWARE MUX LINK' : (hasPhysicalDgpu ? 'OPTIMUS HYBRID LINK' : 'NATIVE iGPU SoC')}
          </span>
        </div>
      </div>

      {/* Notice banner */}
      {notice && <NoticeBanner notice={notice} onClose={onDismissNotice} />}

      {/* 3 Mode Cards (Only displayed when physical discrete GPU & MUX exist) */}
      {hasDgpu ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {/* dGPU */}
        {renderCard('dgpu', {
          accentColor: '#3b82f6',
          accentRgb: '59,130,246',
          iconColor: '#60a5fa',
          iconEl: <Zap className="w-4 h-4 text-blue-400 mb-0.5" />,
          chipLabel: 'dGPU',
          desc: 'The discrete GPU is directly connected to the built-in display, bypassing the iGPU for maximum gaming frame rates and low latency.',
          titleText: 'Discrete GPU Only',
          isActive: hasDgpu && gpuInfo.current_mode === 'dgpu',
          isDisabled: !hasDgpu,
          activeBadgeColor: '#38bdf8',
          activeBadgeText: 'Hardware active',
        })}

        {/* Hybrid */}
        {renderCard('hybrid', {
          accentColor: '#a855f7',
          accentRgb: '168,85,247',
          iconColor: '#c084fc',
          iconEl: <Layers className="w-4 h-4 text-purple-400 mb-0.5" />,
          chipLabel: 'HYBRID',
          desc: 'The iGPU handles light workloads quietly and efficiently; the discrete GPU accelerates demanding 3D apps and games.',
          titleText: 'Hybrid Graphics',
          isActive: hasDgpu && gpuInfo.current_mode === 'hybrid',
          isDisabled: !hasDgpu,
          activeBadgeColor: '#c084fc',
          activeBadgeText: 'Hardware active',
        })}

        {/* iGPU */}
        {renderCard('igpu', {
          accentColor: hasDgpu && !isTriModeSupported ? '#f59e0b' : '#10b981',
          accentRgb: hasDgpu && !isTriModeSupported ? '245,158,11' : '16,185,129',
          iconColor: hasDgpu && !isTriModeSupported ? '#f59e0b' : '#34d399',
          iconEl: hasDgpu && !isTriModeSupported
            ? <ShieldAlert className="w-4 h-4 text-amber-400 mb-0.5" />
            : <PowerOff className="w-4 h-4 text-emerald-400 mb-0.5" />,
          chipLabel: hasDgpu && !isTriModeSupported ? 'LOCK' : 'iGPU',
          desc: !hasDgpu
            ? 'Efficient integrated-only architecture with no discrete GPU or MUX overhead, delivering low heat and long battery life.'
            : (!isTriModeSupported
                ? 'This model has hybrid graphics but no physical iGPU-direct switch. Protection is locked to prevent a black screen on boot.'
                : 'Cuts PCIe power and idle consumption for the discrete GPU to reduce system power and heat and extend battery life.'),
          titleText: !hasDgpu ? 'Native integrated-GPU architecture' : (!isTriModeSupported ? 'Integrated GPU (hybrid mode locked)' : 'Integrated GPU Mode'),
          isActive: !hasDgpu || (isTriModeSupported && gpuInfo.current_mode === 'igpu'),
          isDisabled: hasDgpu && !isTriModeSupported,
          disabledBadge: hasDgpu && !isTriModeSupported ? (
            <div
              className="gpu-mode-disabled-badge"
              style={{
                position: 'absolute', top: '10px', right: '10px',
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '9px', fontWeight: 700,
                color: '#f59e0b', background: 'rgba(245,158,11,0.15)',
                padding: '2px 7px', borderRadius: '4px',
                border: '1px solid rgba(245,158,11,0.3)',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowGeekUnlockModal(true);
              }}
              title={gpuInfo.capabilities?.reason_igpu_unsupported || 'Hybrid graphics safety lock (click to unlock at your own risk)'}
            >
              <Lock className="w-3 h-3 text-amber-400" />
              <span>Hybrid Graphics Safety Lock</span>
            </div>
          ) : (hasDgpu && isSafetyLocked && isUserUnlocked ? (
            <div
              style={{
                position: 'absolute', top: '10px', right: '10px',
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '9px', fontWeight: 700,
                color: '#38bdf8', background: 'rgba(56,189,248,0.15)',
                padding: '2px 7px', borderRadius: '4px',
                border: '1px solid rgba(56,189,248,0.35)',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onUnlockGeekIgpu?.(false);
              }}
              title="Enthusiast override is enabled (click to restore hybrid-mode safety lock)"
            >
              <Unlock className="w-3 h-3 text-sky-400" />
              <span>Enthusiast Unlock Enabled</span>
            </div>
          ) : undefined),
          activeBadgeColor: '#34d399',
          activeBadgeText: !hasDgpu ? 'Running natively on integrated graphics' : 'Hardware active',
        })}
      </div>
    ) : hasPhysicalDgpu ? (
      <div
        className="sys-sub-panel"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Layers className="w-5 h-5 text-purple-400" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Hybrid Graphics Mode (NVIDIA Optimus)
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#c084fc',
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  borderRadius: '4px',
                  padding: '1px 6px',
                }}
              >
                Hardware active
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              This model uses hybrid graphics: the iGPU drives the display and the discrete GPU accelerates demanding 3D workloads. The motherboard has no physical MUX switch; Windows and the GPU driver manage graphics automatically. No manual switching is needed, avoiding black screens or hangs. Brightness, color enhancement, and ICC calibration remain available below.
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'right',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          No Physical MUX Switch (Automatic Switching)
        </div>
      </div>
    ) : (
      <div
        className="sys-sub-panel"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Native Efficient Integrated-Only Architecture
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            This ultrabook has no discrete GPU or physical MUX switch. Graphics and display output are handled by the CPU’s integrated GPU, so it remains in low-power iGPU mode. Brightness, color enhancement, and ICC calibration remain available below.
          </div>
        </div>
      </div>
    )}

      {/* Mode switch confirmation modal */}
      {pendingSwitch && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            className="glass-card"
            style={{
              width: '100%', maxWidth: '460px',
              background: '#0f172a',
              border: '1px solid var(--border-medium)',
              borderRadius: '16px', padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', gap: '18px',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: 'var(--status-warn-dim)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    GPU Mode Switch Notice
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    MECHREVO Factory UEFI Hardware Bus Configuration Change
                  </p>
                </div>
              </div>
              {!loading && !rebooting && (
                <button
                  onClick={onCancelSwitch}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  <X className="w-5 h-5 hover:text-white" />
                </button>
              )}
            </div>

            {/* Mode transition visual */}
            <div
              style={{
                background: 'rgba(30,41,59,0.5)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Current Hardware Mode</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>{pendingSwitch.currentTitle}</span>
                <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>[{pendingSwitch.currentHex}]</span>
              </div>
              <ArrowRight size={18} className="text-blue-400 gpu-modal-arrow" />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Target Mode</span>
                <span className="gpu-modal-target-title" style={{ fontSize: '14px', fontWeight: 800, color: 'var(--status-info)' }}>{pendingSwitch.targetTitle}</span>
                <span className="gpu-modal-target-hex" style={{ fontSize: '9px', color: 'var(--status-info)', fontFamily: 'monospace' }}>[{pendingSwitch.targetHex}]</span>
              </div>
            </div>

            {/* Reinforced Hardware Switching Note */}
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: '1.55',
                background: 'var(--status-warn-dim)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
              }}
            >
              <div>
                Switching to <strong style={{ color: 'var(--text-primary)' }}>{pendingSwitch.targetTitle}</strong> reconfigures the internal display’s physical MUX routing. A system restart is required for the motherboard BIOS POST process to apply the change.
              </div>
              <div style={{ marginTop: '6px', color: 'var(--status-info)', fontSize: '11px', fontWeight: 600 }}>
                🛡️ OpenRevo 强化防黑屏保护：重启前自动唤醒核显供电总线、Refresh PnP 设备树并执行 SPI NVRAM 稳定写入，跳过快速启动陷阱。
              </div>
              <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '10.5px' }}>
                💡 Recovery tip: if a rare model displays a black screen after restarting, hold the power button for 15 seconds to reset EC/BIOS and restore default display output.
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <button
                disabled={loading || rebooting}
                onClick={() => onConfirmSwitch(true)}
                className="gpu-modal-reboot-btn"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  border: '1px solid rgba(147, 197, 253, 0.4)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                  transition: 'all 0.2s ease',
                }}
              >
                <RotateCcw className={`w-4 h-4 ${rebooting ? 'animate-spin' : ''}`} />
                <span>{rebooting ? 'Restarting safely...' : 'Restart Safely Now (Recommended)'}</span>
              </button>

              <button
                disabled={loading || rebooting}
                onClick={() => onConfirmSwitch(false)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-pill)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Restart Later (takes effect at next startup)</span>
              </button>

                  {!rebooting && (
                    <button
                      disabled={loading}
                      onClick={onCancelSwitch}
                      style={{
                        width: '100%', padding: '8px', borderRadius: '8px',
                        background: 'transparent', border: 'none',
                        color: 'var(--text-muted)', fontSize: '12px',
                        cursor: 'pointer', transition: 'color 0.2s ease',
                      }}
                    >
                      Cancel
                    </button>
                  )}
            </div>
          </div>
        </div>
      )}

      {/* Geek unlock disclaimer modal */}
      {showGeekUnlockModal && (
        <div
          className="sys-modal-backdrop"
          onClick={() => {
            setShowGeekUnlockModal(false);
            setGeekConfirmedRisk(false);
          }}
        >
          <div
            className="sys-modal-card danger"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px' }}
          >
            <div className="sys-modal-header">
              <div className="sys-modal-icon-badge danger">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="sys-modal-title">Hybrid Graphics Hardware Protection · Enthusiast Override</div>
                <div className="sys-modal-subtitle">Prevent a permanent black screen on motherboards without a dedicated iGPU bypass switch</div>
              </div>
            </div>

            <div className="sys-modal-body">
              <div className="sys-modal-warning-label">
                ⚠️ Serious Hardware Safety Warning (Risk of Bricking):
              </div>
              <ul className="sys-modal-list">
                <li>
                  <strong>Hardware Design Characteristics</strong>：当前机器底盘（如翼龙 16 Pro 等 TRX1/HP45 代工设计）官方主板<strong>仅具备双显双模电路</strong>，内置屏幕通常未焊装旁路独立核显直连开关。
                </li>
                <li>
                  <strong>Consequences of a Permanent Black Screen</strong>：若在 BIOS 不支持纯核显的主板上强行写入此模式，电脑重启后内屏将<strong>永久黑屏、无背光且无自检信号</strong>，只能通过拆机断电复位 CMOS 甚至烧录器救砖！
                </li>
                <li>
                  <strong>Override Decision</strong>：OpenRevo 坚决不使用模糊猜测数据库，绝不替用户冒变砖风险。若您已<strong>重启进入 BIOS 高级设置亲眼确认</strong>存在并支持『iGPU Only』Mode，可勾选下方免责声明强制解锁。
                </li>
              </ul>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginTop: '14px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  lineHeight: '1.45',
                  padding: '10px',
                  background: 'var(--status-warn-dim)',
                  borderRadius: '8px',
                  border: '1px solid rgba(245,158,11,0.25)',
                }}
              >
                <input
                  type="checkbox"
                  checked={geekConfirmedRisk}
                  onChange={(e) => setGeekConfirmedRisk(e.target.checked)}
                  style={{ marginTop: '2px', cursor: 'pointer' }}
                />
                <span>
                  I have personally verified that the motherboard BIOS supports iGPU-only mode, understand the risk of a black screen or bricked device, and accept responsibility for the hardware consequences.
                </span>
              </label>
            </div>

            <div className="sys-modal-actions">
              <button
                onClick={() => {
                  setShowGeekUnlockModal(false);
                  setGeekConfirmedRisk(false);
                }}
                className="toggle-btn"
              >
                Cancel (推荐保持安全锁定)
              </button>
              <button
                disabled={!geekConfirmedRisk}
                onClick={() => {
                  setShowGeekUnlockModal(false);
                  setGeekConfirmedRisk(false);
                  onUnlockGeekIgpu?.(true);
                }}
                className={`toggle-btn ${geekConfirmedRisk ? 'btn-danger-solid' : ''}`}
                style={{
                  opacity: geekConfirmedRisk ? 1 : 0.45,
                  cursor: geekConfirmedRisk ? 'pointer' : 'not-allowed',
                }}
              >
                Force Unlock Protection (at your own risk)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
