// Pure formatting utilities for GPU mode display — no React dependency.

export function formatGpuShort(name?: string, hasDgpu: boolean = true): string {
  if (!hasDgpu) {
    if (!name || name === 'Discrete GPU' || name === 'High-Performance Discrete GPU' || name === 'Unknown GPU') return 'CPU Integrated Graphics';
    return name
      .replace(/\(R\)/gi, '')
      .replace(/\(TM\)/gi, '')
      .replace(/Graphics/gi, '')
      .trim() || 'CPU Integrated Graphics';
  }
  if (!name) return 'Discrete GPU';
  const s = name
    .replace(/NVIDIA\s+GeForce\s+/gi, '')
    .replace(/\s+Laptop\s+GPU/gi, '')
    .trim();
  return s || 'Discrete GPU';
}

export function formatCpuShort(name?: string): string {
  if (!name) return 'Generic Hardware Platform';
  return name
    .replace(/\(R\)/gi, '')
    .replace(/\(TM\)/gi, '')
    .replace(/14th Gen /gi, '')
    .replace(/13th Gen /gi, '')
    .replace(/12th Gen /gi, '')
    .replace(/Processor/gi, '')
    .trim();
}

export function getModeHexDisplay(mode: string, platform?: string): string {
  const isAmd = platform === 'amd';
  switch (mode) {
    case 'dgpu':   return isAmd ? '0x01' : '0x02';
    case 'hybrid': return isAmd ? '0x00' : '0x04';
    case 'igpu':   return isAmd ? '0x02' : '0x01';
    default:       return '--';
  }
}

export function getModeTitle(mode: string): string {
  switch (mode) {
    case 'dgpu':   return 'Discrete GPU Only';
    case 'hybrid': return 'Hybrid Graphics';
    case 'igpu':   return 'Integrated GPU Mode';
    default:       return 'Unknown Mode';
  }
}
