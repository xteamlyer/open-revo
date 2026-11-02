export interface LightingState {
  kb_enabled: boolean;
  kb_effect: number;
  kb_brightness: number;
  kb_speed: number;
  kb_direction: number;
  kb_color: string;

  // Streamer & Custom Engine
  kb_engine?: 'hardware' | 'streamer' | 'custom';
  kb_fps?: number;
  streamer_effect?: number;
  custom_scale?: number;
  custom_reactive?: boolean;
  custom_script_id?: string;

  // Four-Zone Keyboard Colors
  kb_zones?: [string, string, string, string];

  lb_enabled: boolean;
  lb_effect: number;
  lb_brightness: number;
  lb_speed: number;
  lb_color: string;

  // Rear Vent & Hinge Ambient Light (尾部转轴/出风口氛围灯)
  hinge_enabled: boolean;
  hinge_effect: number;
  hinge_brightness: number;
  hinge_speed: number;
  hinge_color: string;

  logo_enabled: boolean;
  logo_effect: number;
  logo_brightness: number;
  logo_color: string;

  sleep_minutes: number;
  ceremony_enabled?: boolean;
}

export interface KeyboardHardwareInfo {
  hardware_type: string; // 'PerKeyRgb' | 'FourZoneRgb' | 'SingleZoneRgb' | 'SingleColor' | 'None'
  has_ite8291: boolean;
  has_ite7001: boolean;
  has_ite7000?: boolean;
  has_front_lightbar?: boolean;
  is_ec_lightbar?: boolean;
  has_logo?: boolean;
  has_usb_logo?: boolean;
  is_ec_logo?: boolean;
  has_hinge?: boolean;
  is_ec_hinge?: boolean;
  is_four_zone?: boolean;
  description: string;
  brightness_level: number;
  is_on: boolean;
}

// 4-Zone RGB Keyboard Modes (Factory Hardware MCU Effects for ITE 048D:CE00)
export const FOURZONE_KEYBOARD_MODES = [
  { id: 1, name: 'Static Color / 4-Zone', desc: 'Static solid-color lighting with custom colors for each zone' },
  { id: 2, name: 'Single-Color Breathing', desc: 'Smooth gradient halo breathing' },
  { id: 3, name: 'Full-Color Wave', desc: 'Four-zone full-color flowing wave' },
  { id: 5, name: 'Rainbow cycle', desc: 'Smooth synchronized rainbow hue cycle across four zones' },
  { id: 12, name: 'Flashing Transitions', desc: 'Dynamic flashing transitions across four zones' },
  { id: 13, name: 'Mixed Flow', desc: 'Alternating multicolor flow across four zones' },
];

// Factory Hardware MCU Built-in Effects (Direct ITE 8291 execution, 0% CPU)
export const KEYBOARD_MODES = [
  { id: 1, name: 'Static Color', desc: 'Classic static solid-color lighting' },
  { id: 2, name: 'Single-Color Breathing', desc: 'Smooth gradient halo breathing' },
  { id: 3, name: 'Flowing Wave', desc: 'Full-color flowing wave' },
  { id: 4, name: 'Key Glow', desc: 'Keystrokes trigger local flashes' },
  { id: 5, name: 'Rainbow Hue Wheel', desc: 'Smooth circular rainbow cycle' },
  { id: 6, name: 'Ripple Spread', desc: 'Expands outward from each key' },
  { id: 10, name: 'Random Raindrops', desc: 'Random raindrop matrix effect' },
  { id: 9, name: 'Full-Color Marquee', desc: 'Full-color cycling marquee' },
  { id: 17, name: 'Brilliant Fireworks', desc: 'Brilliant fireworks bloom at your fingertips' },
  { id: 14, name: 'Quiet Aurora', desc: 'Quiet, gently flowing aurora' },
  { id: 21, name: 'Gaming Highlights', desc: 'WASD and key gaming controls highlighted' },
];

// BetterRGB 60FPS Streamer High-Refresh Effects (100+ Prefix Namespace to isolate from Hardware MCU 1..21)
export const STREAMER_OFFSET = 100;
export const STREAMER_MODES = [
  { id: 101, name: 'Wave', desc: 'Full-color flowing wave with smooth projection in four directions' },
  { id: 100, name: 'Breathing', desc: 'Soft, precise sine-wave breathing' },
  { id: 102, name: 'Ripple', desc: 'Signature concentric pulse that smoothly expands outward' },
  { id: 103, name: 'Quicksand', desc: '4x supersampling with dual-sine interference for ultra-smooth motion' },
  { id: 104, name: 'Current', desc: 'Eight-pass anti-aliased traveling pulses with exponential fade' },
  { id: 105, name: 'Color Wheel', desc: 'Radial rotating rainbow pinwheel' },
  { id: 106, name: 'Rainbow', desc: 'Smooth hue-wheel rotation across all keys' },
  { id: 107, name: 'Matrix', desc: 'Matrix-style digital rain with animated leading trails and afterglow' },
  { id: 108, name: 'Lightning', desc: 'Branching lightning strikes and flashes' },
  { id: 109, name: 'Flame', desc: 'Flames roll upward from the bottom and gradually fade' },
  { id: 110, name: 'Rain', desc: 'Gentle rain with random droplets and subtle ripples' },
  { id: 111, name: 'Sparkle', desc: 'Keyboard-wide starfield with randomly fading glimmers' },
  { id: 112, name: 'Touch Current', desc: 'High-frequency electric pulses clashing from both directions' },
  { id: 113, name: 'Static Color', desc: 'Pixel-perfect static color per key' },
];

export const LIGHTBAR_MODES = [
  { id: 1, name: 'Static Color', desc: 'Classic static solid-color lighting' },
  { id: 2, name: 'Energy Breathing', desc: 'Soft single-color halo breathing' },
  { id: 20, name: 'Rainbow Breathing', desc: 'Full-spectrum rainbow gradient breathing' },
  { id: 3, name: 'Full-Color Wave', desc: 'Smooth flowing rainbow wave' },
  { id: 4, name: 'Dynamic Collision', desc: 'Flowing lights clash from both ends toward the center' },
  { id: 6, name: 'Fast Meteor', desc: 'A one-way light streak across the front lightbar' },
  { id: 9, name: 'Marquee Flow', desc: 'Full-color wraparound chase effect' },
  { id: 10, name: 'Brilliant Sparkle', desc: 'Random starfield across the front matrix' },
];

export const LOGO_MODES = [
  { id: 1, name: 'Static Color', desc: 'Classic MECHREVO logo lighting' },
  { id: 2, name: 'Single-Color Breathing', desc: 'Slow breathing with a colored energy glow' },
  { id: 20, name: 'Rainbow Breathing', desc: 'Soft breathing through the full rainbow spectrum' },
  { id: 3, name: 'Full-Color Wave', desc: 'Smooth full-color flowing wave' },
  { id: 4, name: 'Dynamic Collision', desc: 'Dynamic clash and collision energy pulse' },
  { id: 6, name: 'Meteor Streak', desc: 'Logo Meteor Flow' },
  { id: 9, name: 'Full-Color Marquee', desc: 'Chasing marquee lights trace the text outline' },
];

// Single-point direct EC PWM badges (e.g. YAOSHI 16 / L16Pro / CANGLONG shield badge)
export const EC_LOGO_MODES = [
  { id: 1, name: 'Static Color', desc: 'Shield logo static color lighting' },
  { id: 2, name: 'Energy Breathing', desc: 'Shield glow with rhythmic fade-in and fade-out' },
  { id: 20, name: 'Rainbow Breathing', desc: 'Shield logo full-color gradient breathing' },
];

export const PRESET_COLORS = [
  { name: 'Mecha Cyan', hex: '#00FFFF' },
  { name: 'Gaming Purple', hex: '#6366F1' },
  { name: 'Aurora Green', hex: '#10B981' },
  { name: 'Flame Red', hex: '#EF4444' },
  { name: 'Cyber Gold', hex: '#F59E0B' },
  { name: 'Phantom Pink', hex: '#EC4899' },
  { name: 'Crystal Blue', hex: '#3B82F6' },
  { name: 'Pure White', hex: '#FFFFFF' },
];

export const SLEEP_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
];

export interface BrfxScript {
  id: string;
  name: string;
  author: string;
  description: string;
  version?: string;
  speed: number;       // 0.2 ~ 3.0
  scale: number;       // 0.5 ~ 2.5
  direction: number;   // 0: R, 1: L, 2: U, 3: D
  reactive: boolean;   // Keypress reaction
  color: string;       // "#RRGGBB"
  code: string;
  filePath?: string;
  builtinEffectId?: number; // Corresponding native engine effect ID (e.g. 200, 201, 202)
  customText?: string;
}

