import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { HardwareState } from '../../types/hardware';
import { Cpu, Repeat, Crosshair } from 'lucide-react';

interface DrawerGpuModeCardProps {
  status: HardwareState;
  onExpandDashboard: (tab?: 'overview' | 'gpu' | 'tuning' | 'lighting' | 'water' | 'system' | 'sponsor' | 'custom_tuning') => void;
}

export const DrawerGpuModeCard: React.FC<DrawerGpuModeCardProps> = ({
  status,
  onExpandDashboard,
}) => {
  // GPU architecture & mode state
  const [gpuModeInfo, setGpuModeInfo] = useState<{
    current_mode: string;
    has_dgpu: boolean;
    has_igpu_present: boolean;
    gpu_name: string;
  } | null>(null);

  useEffect(() => {
    const fetchGpuMode = () => {
      invoke<any>('get_gpu_mode_info')
        .then((res) => {
          if (res) setGpuModeInfo(res);
        })
        .catch(() => {});
    };

    fetchGpuMode();
    window.addEventListener('focus', fetchGpuMode);

    let unlistenGpu: (() => void) | undefined;
    listen<any>('gpu-mode-changed', (e) => {
      if (e.payload) setGpuModeInfo(e.payload);
    }).then((fn) => { unlistenGpu = fn; });

    return () => {
      window.removeEventListener('focus', fetchGpuMode);
      if (unlistenGpu) unlistenGpu();
    };
  }, []);

  return (
    <div className="m-card">
      <div className="m-card-header">
        <div className="m-header-left">
          <Cpu size={13} style={{ color: 'var(--theme-gpu)' }} />
          <span>GPU Mode:</span>
          <span style={{ color: 'var(--theme-gpu)', fontWeight: 700 }}>
            {gpuModeInfo?.has_dgpu === false
              ? 'Integrated GPU (APU-only architecture)'
              : gpuModeInfo?.current_mode === 'dgpu'
              ? 'Discrete GPU Only (dGPU)'
              : gpuModeInfo?.current_mode === 'hybrid'
              ? 'Hybrid Graphics (Dynamic)'
              : gpuModeInfo?.current_mode === 'igpu'
              ? 'Integrated GPU (iGPU)'
              : 'Checking...'}
          </span>
        </div>
        <div className="m-header-right" style={{ color: 'var(--theme-gpu)' }}>
          GPU: {status.gpu_temp > 0 ? `${status.gpu_temp}°C` : (status.cpu_temp > 0 ? `${status.cpu_temp}°C` : '--')} · Fan: {status.gpu_fan_rpm > 0 ? `${status.gpu_fan_rpm} RPM` : 'Silent'}
        </div>
      </div>

      <div className="m-grid-3">
        <button
          className="m-btn-action"
          style={{
            ...(gpuModeInfo?.current_mode === 'igpu' || gpuModeInfo?.has_dgpu === false
              ? {
                  background: 'var(--theme-gpu-dim)',
                  borderColor: 'var(--theme-gpu-border)',
                  color: 'var(--theme-gpu)',
                  boxShadow: '0 0 12px var(--theme-gpu-glow)',
                }
              : {}),
          }}
          title={gpuModeInfo?.has_dgpu === false ? 'Integrated-only ultrabook, running in native iGPU mode' : 'Open advanced GPU switching controls'}
          onClick={() => onExpandDashboard('gpu')}
        >
          <Cpu size={14} />
          <span style={{ fontSize: '10.5px', fontWeight: 600 }}>
            {gpuModeInfo?.has_dgpu === false ? 'Integrated GPU only (active)' : 'Integrated GPU only'}
          </span>
        </button>

        <button
          className="m-btn-action"
          disabled={gpuModeInfo?.has_dgpu === false}
          style={{
            ...(gpuModeInfo?.current_mode === 'hybrid' && gpuModeInfo?.has_dgpu !== false
              ? {
                  background: 'var(--theme-gpu-dim)',
                  borderColor: 'var(--theme-gpu-border)',
                  color: 'var(--theme-gpu)',
                  boxShadow: '0 0 12px var(--theme-gpu-glow)',
                }
              : {}),
            ...(gpuModeInfo?.has_dgpu === false
              ? { opacity: 0.35, cursor: 'not-allowed' }
              : {}),
          }}
          title={gpuModeInfo?.has_dgpu === false ? 'Integrated-only architecture; no discrete GPU available' : 'Open advanced GPU switching controls'}
          onClick={() => {
            if (gpuModeInfo?.has_dgpu !== false) onExpandDashboard('gpu');
          }}
        >
          <Repeat size={14} />
          <span style={{ fontSize: '10.5px', fontWeight: 600 }}>Standard Hybrid</span>
        </button>

        <button
          className="m-btn-action"
          disabled={gpuModeInfo?.has_dgpu === false}
          style={{
            ...(gpuModeInfo?.current_mode === 'dgpu' && gpuModeInfo?.has_dgpu !== false
              ? {
                  background: 'var(--theme-gpu-dim)',
                  borderColor: 'var(--theme-gpu-border)',
                  color: 'var(--theme-gpu)',
                  boxShadow: '0 0 12px var(--theme-gpu-glow)',
                }
              : {}),
            ...(gpuModeInfo?.has_dgpu === false
              ? { opacity: 0.35, cursor: 'not-allowed' }
              : {}),
          }}
          title={gpuModeInfo?.has_dgpu === false ? 'Integrated-only architecture; no discrete GPU available' : 'Open advanced GPU switching controls'}
          onClick={() => {
            if (gpuModeInfo?.has_dgpu !== false) onExpandDashboard('gpu');
          }}
        >
          <Crosshair size={14} />
          <span style={{ fontSize: '10.5px', fontWeight: 600 }}>Discrete GPU Only</span>
        </button>
      </div>
    </div>
  );
};
