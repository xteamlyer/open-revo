import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, Check, RotateCcw, Loader2 } from 'lucide-react';

export interface LightingHardwareOverride {
  enabled: boolean;
  keyboard: string;   // "auto" | "per_key" | "four_zone" | "single_zone" | "single_white" | "none"
  front_bar: string;  // "auto" | "present" | "none"
  ambient: string;    // "auto" | "vent" | "shoulder" | "none"
  logo: string;       // "auto" | "letter" | "shield" | "none"
}

interface LightingRuntimeStatus {
  keyboard_engine: string;
  keyboard_online: boolean;
  keyboard_active: boolean;
  keyboard_fps: number;
  lightbar_online: boolean;
  lightbar_active: boolean;
  hinge_online: boolean;
  hinge_active: boolean;
  logo_online: boolean;
  logo_active: boolean;
  is_sleeping: boolean;
  hardware_override: LightingHardwareOverride;
  detected_baseline: LightingHardwareOverride;
}

interface LightingTopologyOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void;
}

export const LightingTopologyOverrideModal: React.FC<LightingTopologyOverrideModalProps> = ({
  isOpen,
  onClose,
  onApplied,
}) => {
  const [config, setConfig] = useState<LightingHardwareOverride>({
    enabled: false,
    keyboard: 'auto',
    front_bar: 'auto',
    ambient: 'auto',
    logo: 'auto',
  });

  const [baseline, setBaseline] = useState<LightingHardwareOverride>({
    enabled: false,
    keyboard: 'auto',
    front_bar: 'auto',
    ambient: 'auto',
    logo: 'auto',
  });

  const [isApplying, setIsApplying] = useState(false);
  const [applyStep, setApplyStep] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      invoke<LightingRuntimeStatus>('get_lighting_runtime_status')
        .then((status) => {
          if (status.hardware_override) {
            setConfig(status.hardware_override);
          }
          if (status.detected_baseline) {
            setBaseline(status.detected_baseline);
          }
        })
        .catch((err) => {
          console.error('[LightingTopology] Failed to fetch runtime status:', err);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (category: keyof LightingHardwareOverride, value: string) => {
    setErrorMessage('');
    setConfig((prev) => ({
      ...prev,
      enabled: true,
      [category]: value,
    }));
  };

  const handleResetToAuto = () => {
    setErrorMessage('');
    setConfig({
      enabled: false,
      keyboard: 'auto',
      front_bar: 'auto',
      ambient: 'auto',
      logo: 'auto',
    });
  };

  const handleApply = async () => {
    setIsApplying(true);
    setErrorMessage('');
    setApplyStep('Safely resetting the driver and hardware...');

    try {
      // 保证用户纠偏时如果全是 auto 则将 enabled 置为 false
      const isAllAuto =
        config.keyboard === 'auto' &&
        config.front_bar === 'auto' &&
        config.ambient === 'auto' &&
        config.logo === 'auto';

      const finalCfg: LightingHardwareOverride = {
        ...config,
        enabled: !isAllAuto,
      };

      await invoke('apply_lighting_hardware_override', {
        overrideCfg: finalCfg,
        override_cfg: finalCfg,
      });

      setConfig(finalCfg);
      setApplyStep('Hardware channel bound successfully!');
      setTimeout(() => {
        setIsApplying(false);
        onClose();
        if (onApplied) onApplied();
      }, 500);
    } catch (err) {
      console.error('[LightingTopology] Failed to apply override:', err);
      setIsApplying(false);
      setApplyStep('');
      setErrorMessage(String(err));
    }
  };

  // 计算差异项
  const effectiveKb = config.keyboard === 'auto' ? baseline.keyboard : config.keyboard;
  const effectiveFront = config.front_bar === 'auto' ? baseline.front_bar : config.front_bar;
  const effectiveAmb = config.ambient === 'auto' ? baseline.ambient : config.ambient;
  const effectiveLogo = config.logo === 'auto' ? baseline.logo : config.logo;

  let diffCount = 0;
  if (config.keyboard !== 'auto' && config.keyboard !== baseline.keyboard) diffCount++;
  if (config.front_bar !== 'auto' && config.front_bar !== baseline.front_bar) diffCount++;
  if (config.ambient !== 'auto' && config.ambient !== baseline.ambient) diffCount++;
  if (config.logo !== 'auto' && config.logo !== baseline.logo) diffCount++;

  return (
    <div className="sys-modal-backdrop" onClick={onClose}>
      <div
        className="sys-modal-card"
        style={{ maxWidth: '840px', width: '94%', overflow: 'visible' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sys-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              className="sys-modal-icon-badge"
              style={{ background: 'var(--status-info-dim)', color: 'var(--status-info)' }}
            >
              <Cpu size={18} />
            </div>
            <div>
              <div className="sys-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Lighting Hardware Topology Override</span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    color: 'var(--status-info)',
                    background: 'var(--status-info-dim)',
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--status-info)',
                  }}
                >
                  Ultrabook Adaptive
                </span>
              </div>
              <div className="sys-modal-subtitle">
                If automatic detection does not match the physical hardware, select the device manually here. Hover over an option or <strong>ⓘ</strong> to view hardware protocols and supported models.
              </div>
            </div>
          </div>
        </div>

        {/* Body: 紧凑行 4 维度拓扑 */}
        <div className="sys-modal-body" style={{ overflow: 'visible', padding: '14px 20px' }}>
          {errorMessage && (
            <div
              style={{
                marginBottom: '12px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--status-error-dim)',
                color: 'var(--status-error)',
                fontSize: '12px',
                border: '1px solid var(--status-error)',
              }}
            >
              Failed to apply: {errorMessage}
            </div>
          )}
          <div className="topology-container">

            {/* 1. 键盘背光 */}
            <div className="topology-row">
              <div className="topology-row-left">
                <span className="topology-row-title">⌨️ 1. Keyboard Backlight Hardware</span>
                <span className="topology-row-hint">
                  Auto-detected: <strong>{baseline.keyboard || 'Checking'}</strong>
                </span>
              </div>
              <div className="topology-radio-group">
                {/* 全彩逐键 */}
                <div
                  className={`topology-pill ${effectiveKb === 'per_key' ? 'selected' : ''}`}
                  onClick={() => handleSelect('keyboard', 'per_key')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Full-Color Per-Key RGB</span>
                  {baseline.keyboard === 'per_key' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>全彩逐键 RGB</span>
                      <span className="topology-tip-chip">048D:600B / CE00</span>
                    </div>
                    <p className="topology-tip-desc">Each key features independent color settings and supports BetterRGB 60 FPS “Geek Glow,” “Water Ripples,” and custom shaders.</p>
                    <div className="topology-tip-example">Examples: Yao Shi 16 Pro/Ultra, Cang Long 16, Jiao Long GM7ZG7S (CE00), and other high-end models</div>
                  </div>
                </div>

                {/* 4区 RGB */}
                <div
                  className={`topology-pill ${effectiveKb === 'four_zone' ? 'selected' : ''}`}
                  onClick={() => handleSelect('keyboard', 'four_zone')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">4-Zone RGB</span>
                  {baseline.keyboard === 'four_zone' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>4-Zone RGB Hardware</span>
                      <span className="topology-tip-chip">048D:CE00</span>
                    </div>
                    <p className="topology-tip-desc">The keyboard is divided into four physical zones with independent colors. Supports hardware wave, marquee, and breathing effects.</p>
                    <div className="topology-tip-example">Typical models: Jiaolong 16, X10 Pro, early Aurora editions</div>
                  </div>
                </div>

                {/* 单区 RGB */}
                <div
                  className={`topology-pill ${effectiveKb === 'single_zone' ? 'selected' : ''}`}
                  onClick={() => handleSelect('keyboard', 'single_zone')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Single-Zone RGB</span>
                  {baseline.keyboard === 'single_zone' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>Single-Zone RGB (One Color Across Keyboard)</span>
                      <span className="topology-tip-chip">EC RAM PWM</span>
                    </div>
                    <p className="topology-tip-desc">Driven directly by the motherboard EC. The whole keyboard changes color as one zone, supporting static color, breathing, and rainbow gradients.</p>
                    <div className="topology-tip-example">Typical models: Aurora X, single-zone YaoShi 15, Kuangshi G16</div>
                  </div>
                </div>

                {/* 单色白光 */}
                <div
                  className={`topology-pill ${effectiveKb === 'single_white' ? 'selected' : ''}`}
                  onClick={() => handleSelect('keyboard', 'single_white')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Solid White</span>
                  {baseline.keyboard === 'single_white' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>White Keyboard Backlight</span>
                      <span className="topology-tip-chip">EC 1932</span>
                    </div>
                    <p className="topology-tip-desc">纯白光 LED，支持关 / Dim (50%) / Bright (100%) 三档无频闪梯级调光。</p>
                    <div className="topology-tip-example">Typical models: Wujie 14X, Wujie 15X, and other ultrabooks</div>
                  </div>
                </div>

                {/* 禁用 */}
                <div
                  className={`topology-pill ${effectiveKb === 'none' ? 'selected' : ''}`}
                  onClick={() => handleSelect('keyboard', 'none')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">No Backlight / Disabled</span>
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>No Keyboard Backlight</span>
                      <span className="topology-tip-chip">Disabled</span>
                    </div>
                    <p className="topology-tip-desc">The model has no keyboard backlight, or the keyboard control card is hidden in software.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 前置海岸灯条 */}
            <div className="topology-row">
              <div className="topology-row-left">
                <span className="topology-row-title">🌊 2. Front Lightbar</span>
                <span className="topology-row-hint">
                  Auto-detected: <strong>{baseline.front_bar === 'present' ? 'Lightbar Present' : 'Not detected'}</strong>
                </span>
              </div>
              <div className="topology-radio-group">
                <div
                  className={`topology-pill ${effectiveFront === 'present' ? 'selected' : ''}`}
                  onClick={() => handleSelect('front_bar', 'present')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Front Lightbar (Present)</span>
                  {baseline.front_bar === 'present' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>Front Edge Lightbar</span>
                      <span className="topology-tip-chip">048D:7001 / EC</span>
                    </div>
                    <p className="topology-tip-desc">A slim, segmented lightbar along the front edge below the touchpad. Supports clash, marquee, and full-color wave effects.</p>
                    <div className="topology-tip-example">Typical models: YaoShi 16, Jiaolong 16, and other models with a front lightbar</div>
                  </div>
                </div>

                <div
                  className={`topology-pill ${effectiveFront === 'none' ? 'selected' : ''}`}
                  onClick={() => handleSelect('front_bar', 'none')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">No Front Lightbar (Disabled)</span>
                  {baseline.front_bar === 'none' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>No Front Lightbar</span>
                      <span className="topology-tip-chip">None</span>
                    </div>
                    <p className="topology-tip-desc">The chassis has no front lightbar. Selecting this removes the unused lightbar card and stops related commands.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 特色氛围灯 */}
            <div className="topology-row">
              <div className="topology-row-left">
                <span className="topology-row-title">💨 3. Ambient Lighting</span>
                <span className="topology-row-hint">
                  Auto-detected: <strong>{baseline.ambient || 'Not detected'}</strong>
                </span>
              </div>
              <div className="topology-radio-group">
                <div
                  className={`topology-pill ${effectiveAmb === 'vent' ? 'selected' : ''}`}
                  onClick={() => handleSelect('ambient', 'vent')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Rear Exhaust Ambient Lighting</span>
                  {baseline.ambient === 'vent' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>Rear Exhaust Grille Lighting</span>
                      <span className="topology-tip-chip">048D:7000 / Hinge</span>
                    </div>
                    <p className="topology-tip-desc">Symmetrical exhaust-style light strips beside the rear vents, a signature feature of liquid-cooled chassis designs.</p>
                    <div className="topology-tip-example">Typical models: flagship Kuangshi 16 Super liquid-cooled editions</div>
                  </div>
                </div>

                <div
                  className={`topology-pill ${effectiveAmb === 'shoulder' ? 'selected' : ''}`}
                  onClick={() => handleSelect('ambient', 'shoulder')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Wing-Shaped Shoulder Lights</span>
                  {baseline.ambient === 'shoulder' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>Dual Wing-Shaped Shoulder Lights</span>
                      <span className="topology-tip-chip">IDZ Sync</span>
                    </div>
                    <p className="topology-tip-desc">Two wing-shaped light strips above the left and right sides of the keyboard, pulsing in sync with the keyboard.</p>
                    <div className="topology-tip-example">Typical models: Deep Sea Phantom IDZ chassis series</div>
                  </div>
                </div>

                <div
                  className={`topology-pill ${effectiveAmb === 'none' ? 'selected' : ''}`}
                  onClick={() => handleSelect('ambient', 'none')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">No Ambient Lighting (Default)</span>
                  {baseline.ambient === 'none' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>No Additional Ambient Lighting</span>
                      <span className="topology-tip-chip">None</span>
                    </div>
                    <p className="topology-tip-desc">Standard models have no rear exhaust or shoulder lights, so no ambient-lighting controls are shown.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. A面 LOGO */}
            <div className="topology-row">
              <div className="topology-row-left">
                <span className="topology-row-title">✨ 4. Lid Logo 灯</span>
                <span className="topology-row-hint">
                  Auto-detected: <strong>{baseline.logo || 'Not detected'}</strong>
                </span>
              </div>
              <div className="topology-radio-group">
                <div
                  className={`topology-pill ${effectiveLogo === 'letter' ? 'selected' : ''}`}
                  onClick={() => handleSelect('logo', 'letter')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Lettering Logo (MECHREVO)</span>
                  {baseline.logo === 'letter' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>Illuminated MECHREVO Lettering Logo</span>
                      <span className="topology-tip-chip">USB NewLogo (35)</span>
                    </div>
                    <p className="topology-tip-desc">The full MECHREVO wordmark is illuminated by a dedicated USB controller and supports full-color wave and marquee effects.</p>
                    <div className="topology-tip-example">Typical models: GM6IX0B and early special YaoShi editions</div>
                  </div>
                </div>

                <div
                  className={`topology-pill ${effectiveLogo === 'shield' ? 'selected' : ''}`}
                  onClick={() => handleSelect('logo', 'shield')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">Shield Logo (Top-and-Bottom Emblem)</span>
                  {baseline.logo === 'shield' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>Illuminated Shield Emblem</span>
                      <span className="topology-tip-chip">Motherboard EC 1963</span>
                    </div>
                    <p className="topology-tip-desc">A two-part shield/nut-shaped illuminated emblem driven directly by the motherboard EC. Supports static color, breathing, and three-color mixing.</p>
                    <div className="topology-tip-example">Typical models: Canglong, YaoShi series, Aurora X, and Jiaolong</div>
                  </div>
                </div>

                <div
                  className={`topology-pill ${effectiveLogo === 'none' ? 'selected' : ''}`}
                  onClick={() => handleSelect('logo', 'none')}
                >
                  <div className="topology-dot" />
                  <span className="topology-pill-label">无 Lid Logo 灯</span>
                  {baseline.logo === 'none' && <span className="topology-badge-auto">Auto</span>}
                  <div className="topology-tip-icon">ⓘ</div>
                  <div className="topology-tooltip">
                    <div className="topology-tip-title">
                      <span>无 Lid Logo 背光</span>
                      <span className="topology-tip-chip">None</span>
                    </div>
                    <p className="topology-tip-desc">The lid has only a metal badge, printed lettering, or a non-illuminated logo. Hide the lid-lighting controls to prevent accidental use.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className="sys-modal-actions" style={{ justifyContent: 'space-between', padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="toggle-btn"
              onClick={handleResetToAuto}
              style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <RotateCcw size={12} />
              <span>Restore Automatic Detection</span>
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {diffCount === 0 ? (
                'Matches automatic detection'
              ) : (
                <span style={{ color: 'var(--status-warning)', fontWeight: 600 }}>
                  {diffCount} manual overrides applied
                </span>
              )}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="toggle-btn"
              onClick={onClose}
              disabled={isApplying}
            >
              Cancel
            </button>
            <button
              type="button"
              className="toggle-btn active-indigo"
              onClick={handleApply}
              disabled={isApplying}
              style={{ fontWeight: 700 }}
            >
              {isApplying ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>{applyStep || 'Applying...'}</span>
                </>
              ) : (
                <>
                  <Check size={13} />
                  <span>Save and Reinitialize Hardware</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
