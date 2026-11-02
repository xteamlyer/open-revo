use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use slint::{Color, ComponentHandle, RgbaColor};
pub use slint;

use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_DONOTROUND,
};
use windows::Win32::System::Threading::GetCurrentThreadId;

use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumThreadWindows, GetParent, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, SetWindowLongPtrW,
    SetWindowPos, SetWindowTextW, ShowWindow, GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SM_CXSCREEN, SM_CYSCREEN,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP,
};

pub mod ipc;

fn osd_log(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("C:\\Users\\faint\\.openrevo_osd.log") {
        let _ = writeln!(f, "[{}] {}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(), msg);
    }
}


slint::include_modules!();

#[derive(Debug, Clone)]
pub struct NativeOsdConfig {
    pub enabled: bool,
    pub theme: String,    // "pill" | "fade" | "cinema"
    pub scale: String,    // "80%" | "100%" | "120%" | "140%"
    pub position: String, // "top-left" | "bottom-center" | "center"
}

impl Default for NativeOsdConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            theme: "pill".into(),
            scale: "100%".into(),
            position: "top-left".into(),
        }
    }
}

pub fn parse_scale_factor(scale_str: &str) -> f32 {
    match scale_str {
        "80%" => 0.8,
        "120%" => 1.2,
        "140%" => 1.4,
        _ => 1.0,
    }
}

/// Send & Sync wrapper around Windows HWND handle
#[derive(Debug, Clone, Copy)]
pub struct SafeHwnd(pub isize);

unsafe impl Send for SafeHwnd {}
unsafe impl Sync for SafeHwnd {}

impl SafeHwnd {
    pub fn from_hwnd(hwnd: HWND) -> Self {
        Self(hwnd.0 as isize)
    }

    pub fn as_hwnd(&self) -> HWND {
        HWND(self.0 as *mut _)
    }
}

unsafe extern "system" fn enum_thread_wnd_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if let Ok(parent) = GetParent(hwnd) {
        if !parent.0.is_null() {
            return BOOL(1);
        }
    }

    let mut rect = RECT::default();
    let _ = GetWindowRect(hwnd, &mut rect);
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;

    osd_log(&format!("enum_thread_wnd: hwnd={:?}, w={}, h={}", hwnd.0, w, h));

    // Top-level Slint OsdWindow has non-zero dimensions
    if w >= 100 && h >= 10 {
        let target = lparam.0 as *mut HWND;
        *target = hwnd;
        return BOOL(0); // Found target window, stop enumeration
    }
    BOOL(1) // Continue enumeration
}

fn find_thread_hwnd() -> Option<HWND> {
    let mut found_hwnd = HWND(std::ptr::null_mut());
    unsafe {
        let thread_id = GetCurrentThreadId();
        let _ = EnumThreadWindows(
            thread_id,
            Some(enum_thread_wnd_proc),
            LPARAM(&mut found_hwnd as *mut HWND as isize),
        );
    }
    if found_hwnd.0.is_null() {
        None
    } else {
        Some(found_hwnd)
    }
}

fn calculate_osd_position(position_str: &str, win_width: i32, win_height: i32) -> (i32, i32) {
    let screen_w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let screen_h = unsafe { GetSystemMetrics(SM_CYSCREEN) };

    match position_str {
        "top-left" | "left" => (36, 42),
        "top-right" | "right" => (screen_w - win_width - 36, 42),
        "bottom-center" | "bottom" => ((screen_w - win_width) / 2, screen_h - win_height - 72),
        "bottom-left" => (36, screen_h - win_height - 72),
        "center" => ((screen_w - win_width) / 2, (screen_h - win_height) / 2),
        _ => ((screen_w - win_width) / 2, 42), // Default "top-center"
    }
}

pub fn apply_osd_window_styles(hwnd: HWND, position_str: &str) {
    unsafe {
        // Clear title string so Windows DWM titlebar renderer has nothing to display
        let empty_title: [u16; 1] = [0];
        let _ = SetWindowTextW(hwnd, windows::core::PCWSTR(empty_title.as_ptr()));

        // Remove caption/border decorations without WS_VISIBLE to prevent flash
        SetWindowLongPtrW(hwnd, GWL_STYLE, WS_POPUP.0 as isize);

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let new_ex_style = (ex_style
            | (WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) as isize)
            & !(0x00040000);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style);

        let corner_pref = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner_pref as *const _ as *const _,
            std::mem::size_of_val(&corner_pref) as u32,
        );

        let margins = MARGINS {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        };
        let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        let win_width = rect.right - rect.left;
        let win_height = rect.bottom - rect.top;

        let (x, y) = calculate_osd_position(position_str, win_width, win_height);

        // Crucial: SWP_FRAMECHANGED forces Windows DWM to discard and recalculate non-client caption bar!
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
        let _ = ShowWindow(hwnd, SW_HIDE);
        osd_log(&format!("apply_osd_window_styles applied at ({}, {}) for hwnd={:?}", x, y, hwnd.0));
    }
}


#[allow(dead_code)]
struct OsdGlobalState {
    window: slint::Weak<OsdWindow>,
    hwnd: Arc<Mutex<Option<SafeHwnd>>>,
    config: Arc<Mutex<NativeOsdConfig>>,
}

static OSD_STATE: OnceLock<OsdGlobalState> = OnceLock::new();

fn reveal_osd_window(hwnd_opt: Option<SafeHwnd>) {
    if let Some(safe_hwnd) = hwnd_opt {
        unsafe {
            let _ = ShowWindow(safe_hwnd.as_hwnd(), SW_SHOWNOACTIVATE);
            let _ = SetWindowPos(
                safe_hwnd.as_hwnd(),
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
        osd_log(&format!("reveal_osd_window: Shown HWND {:?}", safe_hwnd.0));
    } else {
        osd_log("reveal_osd_window: WARNING safe_hwnd is None");
    }
}

static HIDE_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn handle_ipc_message(
    raw: &str,
    ui_weak: &slint::Weak<OsdWindow>,
    hwnd_shared: &Arc<Mutex<Option<SafeHwnd>>>,
) {
    let Ok(val) = serde_json::from_str::<serde_json::Value>(raw) else {
        osd_log(&format!("handle_ipc_message: invalid JSON: {}", raw));
        return;
    };

    let action = val.get("action").and_then(|a| a.as_str()).unwrap_or("");
    osd_log(&format!("handle_ipc_message: action = {}", action));
    let weak = ui_weak.clone();
    let hwnd_cloned = hwnd_shared.clone();

    match action {
        "mode" => {
            let mode = val.get("value").and_then(|v| v.as_u64()).unwrap_or(1) as u8;
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_power_mode_internal(&ui, mode);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }
        "fan" => {
            let enabled = val.get("value").and_then(|v| v.as_bool()).unwrap_or(false);
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_fan_boost_internal(&ui, enabled);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }
        "preview" => {
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_power_mode_internal(&ui, 3);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }
        "key_lock" => {
            let name = val.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let locked = val.get("locked").and_then(|l| l.as_bool()).unwrap_or(false);
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_key_lock_toast_internal(&ui, &name, locked);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }
        "device_switch" => {
            let name = val.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let enabled = val.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false);
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_device_switch_internal(&ui, &name, enabled);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }
        "kb_brightness" => {
            let level = val.get("level").and_then(|l| l.as_u64()).unwrap_or(0) as u8;
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_kb_brightness_internal(&ui, level);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }
        "kb_sleep" => {
            let seconds = val.get("seconds").and_then(|s| s.as_u64()).unwrap_or(0) as u32;
            let gen = HIDE_GENERATION.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    let hwnd_snap = *hwnd_cloned.lock().unwrap();
                    reveal_osd_window(hwnd_snap);
                    show_kb_sleep_internal(&ui, seconds);
                    schedule_auto_hide_internal(&ui, hwnd_cloned.clone(), gen);
                }
            });
        }

        "config" => {
            let theme = val.get("theme").and_then(|t| t.as_str()).unwrap_or("pill").to_string();
            let scale = val.get("scale").and_then(|s| s.as_str()).unwrap_or("100%").to_string();
            let position = val.get("position").and_then(|p| p.as_str()).unwrap_or("top-left").to_string();
            let scale_factor = parse_scale_factor(&scale);
            osd_log(&format!("handle_ipc_message config: theme={}, scale={}, pos={}", theme, scale, position));
            if let Some(state) = OSD_STATE.get() {
                let mut cfg = state.config.lock().unwrap();
                cfg.theme = theme.clone();
                cfg.scale = scale.clone();
                cfg.position = position.clone();
            }
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(ui) = weak.upgrade() {
                    ui.set_osd_theme(theme.into());
                    ui.set_osd_scale(scale_factor);
                    if let Some(safe_hwnd) = *hwnd_cloned.lock().unwrap() {
                        apply_osd_window_styles(safe_hwnd.as_hwnd(), &position);
                    }
                }
            });
        }
        "quit" => {
            std::process::exit(0);
        }
        _ => {}
    }
}



fn show_power_mode_internal(ui: &OsdWindow, mode: u8) {
    let (title, subtitle, icon, color, bg) = match mode {
        1 => (
            "Office Mode",
            "OFFICE MODE · ultimate silence, battery-first",
            "🌱",
            Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }),
            Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 35 }),
        ),
        2 => (
            "Balanced Mode",
            "BALANCE MODE · smart everyday efficiency",
            "⚖️",
            Color::from(RgbaColor { red: 6, green: 182, blue: 212, alpha: 255 }),
            Color::from(RgbaColor { red: 6, green: 182, blue: 212, alpha: 35 }),
        ),
        3 => (
            "Beast Mode",
            "BEAST MODE · maximum performance, full power",
            "⚡",
            Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }),
            Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 35 }),
        ),
        _ => (
            "Custom Tuning",
            "CUSTOM MODE · deep power and thermal curves",
            "💧",
            Color::from(RgbaColor { red: 168, green: 85, blue: 247, alpha: 255 }),
            Color::from(RgbaColor { red: 168, green: 85, blue: 247, alpha: 35 }),
        ),
    };

    ui.set_mode_title(title.into());
    ui.set_mode_subtitle(subtitle.into());
    ui.set_icon_symbol(icon.into());
    ui.set_accent_color(color);
    ui.set_accent_bg(bg);
    ui.set_is_active(true);
}

fn show_fan_boost_internal(ui: &OsdWindow, enabled: bool) {
    let (title, subtitle, icon, color, bg) = if enabled {
        (
            "Fan Boost On",
            "FAN BOOST: ON · both fans at full speed",
            "🌪️",
            Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }),
            Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 35 }),
        )
    } else {
        (
            "Fan Boost Off",
            "FAN BOOST: OFF · back to the smart thermal profile",
            "💨",
            Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }),
            Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 35 }),
        )
    };

    ui.set_mode_title(title.into());
    ui.set_mode_subtitle(subtitle.into());
    ui.set_icon_symbol(icon.into());
    ui.set_accent_color(color);
    ui.set_accent_bg(bg);
    ui.set_is_active(true);
}

fn show_key_lock_toast_internal(ui: &OsdWindow, name: &str, locked: bool) {
    let (title, sub, icon, color) = match name {
        "win" => {
            if locked {
                ("Win Key Lock On", "WIN KEY LOCKED · no in-game mistouches", "🔒", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            } else {
                ("Win Key Lock Off", "WIN KEY UNLOCKED · system response restored", "🔓", Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }))
            }
        }
        "fn" => {
            if locked {
                ("Fn Lock On", "FN LOCK: ON · media and shortcut keys first", "⚡", Color::from(RgbaColor { red: 6, green: 182, blue: 212, alpha: 255 }))
            } else {
                ("Fn Lock Off", "FN LOCK: OFF · standard F1-F12 keys first", "⌨️", Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }))
            }
        }
        "touchpad" => {
            if locked {
                ("Touchpad Disabled", "TOUCHPAD DISABLED · no in-game mistouches", "🚫", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            } else {
                ("Touchpad Enabled", "TOUCHPAD ENABLED · touch input restored", "🖱️", Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }))
            }
        }
        "caps" => {
            if locked {
                ("Caps Lock On", "CAPS LOCK: ON · typing uppercase letters", "🔠", Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }))
            } else {
                ("Caps Lock Off", "CAPS LOCK: OFF · typing lowercase letters", "🔡", Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }))
            }
        }
        "num" => {
            if locked {
                ("Num Lock On", "NUM LOCK: ON · right numeric keypad active", "🔢", Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }))
            } else {
                ("Num Lock Off", "NUM LOCK: OFF · arrow and navigation mode", "⌨️", Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }))
            }
        }
        "scroll" => {
            if locked {
                ("Scroll Lock On", "SCROLL LOCK: ON · scroll lock is active", "📜", Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }))
            } else {
                ("Scroll Lock Off", "SCROLL LOCK: OFF · normal cursor scrolling", "📄", Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }))
            }
        }
        _ => {
            if locked {
                ("Locked", "LOCKED · state switched", "🔒", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            } else {
                ("Unlocked", "UNLOCKED · state restored", "🔓", Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }))
            }
        }
    };

    ui.set_mode_title(title.into());
    ui.set_mode_subtitle(sub.into());
    ui.set_icon_symbol(icon.into());
    ui.set_accent_color(color);
    ui.set_accent_bg(Color::from(RgbaColor { red: 100, green: 100, blue: 100, alpha: 30 }));
    ui.set_is_active(true);
}

fn show_device_switch_internal(ui: &OsdWindow, name: &str, enabled: bool) {
    let (title, sub, icon, color) = match name {
        "camera" => {
            if enabled {
                ("Camera On", "CAMERA ENABLED · live view restored", "📷", Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }))
            } else {
                ("Camera Off", "CAMERA DISABLED · hardware-level privacy shutter", "🚫", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            }
        }
        "mic" => {
            if enabled {
                ("Microphone On", "MICROPHONE UNMUTED · audio capture restored", "🎙️", Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }))
            } else {
                ("Microphone Muted", "MICROPHONE MUTED · the mic is silenced", "🔇", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            }
        }
        "wifi" => {
            if enabled {
                ("Wi-Fi On", "WI-FI ENABLED · wireless adapter active", "📶", Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }))
            } else {
                ("Wi-Fi Off", "WI-FI DISABLED · wireless adapter stopped", "✈️", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            }
        }
        "bluetooth" => {
            if enabled {
                ("Bluetooth On", "BLUETOOTH ENABLED · Bluetooth radio on", "ᛒ", Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }))
            } else {
                ("Bluetooth Off", "BLUETOOTH DISABLED · Bluetooth radio off", "📵", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            }
        }
        "keep_awake" => {
            if enabled {
                ("Keep Awake On", "KEEP AWAKE: ON · blocks automatic system sleep", "☕", Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }))
            } else {
                ("Keep Awake Off", "KEEP AWAKE: OFF · default sleep policy restored", "💤", Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }))
            }
        }
        _ => {
            if enabled {
                ("Feature Enabled", "FEATURE ENABLED", "✅", Color::from(RgbaColor { red: 16, green: 185, blue: 129, alpha: 255 }))
            } else {
                ("Feature Disabled", "FEATURE DISABLED", "❌", Color::from(RgbaColor { red: 239, green: 68, blue: 68, alpha: 255 }))
            }
        }
    };

    ui.set_mode_title(title.into());
    ui.set_mode_subtitle(sub.into());
    ui.set_icon_symbol(icon.into());
    ui.set_accent_color(color);
    ui.set_accent_bg(Color::from(RgbaColor { red: 100, green: 100, blue: 100, alpha: 30 }));
    ui.set_is_active(true);
}

fn show_kb_brightness_internal(ui: &OsdWindow, level: u8) {
    let (title, sub, icon, color) = if level == 0 {
        ("Keyboard Backlight Off".to_string(), "KEYBOARD BACKLIGHT: OFF · backlight turned off".to_string(), "💡", Color::from(RgbaColor { red: 148, green: 163, blue: 184, alpha: 255 }))
    } else {
        let pct = match level {
            1 => 25,
            2 => 50,
            3 => 75,
            _ => 100,
        };
        (
            format!("Keyboard Backlight {}%", pct),
            format!("KEYBOARD BACKLIGHT · brightness (level {})", level),
            "💡",
            Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }),
        )
    };

    ui.set_mode_title(title.into());
    ui.set_mode_subtitle(sub.into());
    ui.set_icon_symbol(icon.into());
    ui.set_accent_color(color);
    ui.set_accent_bg(Color::from(RgbaColor { red: 100, green: 100, blue: 100, alpha: 30 }));
    ui.set_is_active(true);
}

fn show_kb_sleep_internal(ui: &OsdWindow, seconds: u32) {
    let (title, sub) = if seconds == 0 {
        ("Keyboard Backlight Always On".to_string(), "KEYBOARD TIMEOUT · the backlight stays lit permanently".to_string())
    } else {
        (
            format!("Backlight turns off in {}s", seconds),
            format!("KEYBOARD TIMEOUT · auto-off after {}s of inactivity", seconds),
        )
    };

    ui.set_mode_title(title.into());
    ui.set_mode_subtitle(sub.into());
    ui.set_icon_symbol("⏳".into());
    ui.set_accent_color(Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 255 }));
    ui.set_accent_bg(Color::from(RgbaColor { red: 56, green: 189, blue: 248, alpha: 35 }));
    ui.set_is_active(true);
}

fn schedule_auto_hide_internal(ui: &OsdWindow, hwnd_shared: Arc<Mutex<Option<SafeHwnd>>>, generation: u64) {
    let weak = ui.as_weak();
    slint::Timer::single_shot(Duration::from_millis(1800), move || {
        if HIDE_GENERATION.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return; // Superseded by a newer OSD event, abort hiding
        }
        if let Some(target) = weak.upgrade() {
            target.set_is_active(false);

            let hide_hwnd = hwnd_shared.clone();
            slint::Timer::single_shot(Duration::from_millis(260), move || {
                if HIDE_GENERATION.load(std::sync::atomic::Ordering::SeqCst) != generation {
                    return; // Superseded by a newer OSD event, keep shown
                }
                if let Some(safe_hwnd) = *hide_hwnd.lock().unwrap() {
                    unsafe {
                        let _ = ShowWindow(safe_hwnd.as_hwnd(), SW_HIDE);
                    }
                    osd_log("schedule_auto_hide: window hidden via SW_HIDE");
                }
            });
        }
    });
}


/// Standalone entrypoint for --osd-companion process mode.
/// Runs exclusively on the true Main Thread without conflicting with foreign event loops.
pub fn run_osd_standalone() {
    std::panic::set_hook(Box::new(|info| {
        osd_log(&format!("FATAL PANIC in OSD Companion: {}", info));
    }));

    osd_log("run_osd_standalone entered");

    let osd = match OsdWindow::new() {
        Ok(w) => w,
        Err(e) => {
            osd_log(&format!("FATAL: Failed to create Slint OsdWindow: {}", e));
            return;
        }
    };

    let osd_weak = osd.as_weak();
    let hwnd_holder = Arc::new(Mutex::new(None));
    let cfg_shared = Arc::new(Mutex::new(NativeOsdConfig::default()));

    let _ = OSD_STATE.set(OsdGlobalState {
        window: osd_weak.clone(),
        hwnd: hwnd_holder.clone(),
        config: cfg_shared.clone(),
    });

    // Start stdin IPC listener
    ipc::start_ipc_server(osd_weak.clone(), hwnd_holder.clone());

    // Show window once so winit actually creates the HWND
    let _ = osd.show();
    osd_log("Called osd.show() once to force HWND creation");

    // Initial capture and style setup timer
    let timer = slint::Timer::default();
    let applied_once = Arc::new(Mutex::new(false));
    let applied_clone = applied_once.clone();
    let hwnd_setter = hwnd_holder.clone();
    let cfg_getter = cfg_shared.clone();
    let osd_init_weak = osd.as_weak();

    timer.start(
        slint::TimerMode::Repeated,
        Duration::from_millis(20),
        move || {
            let mut done = applied_clone.lock().unwrap();
            if !*done {
                if let Some(hwnd) = find_thread_hwnd() {
                    osd_log(&format!("Captured target HWND: {:?}", hwnd.0));
                    let (pos, theme, scale) = {
                        let c = cfg_getter.lock().unwrap();
                        (c.position.clone(), c.theme.clone(), c.scale.clone())
                    };
                    if let Some(ui) = osd_init_weak.upgrade() {
                        ui.set_osd_theme(theme.clone().into());
                        ui.set_osd_scale(parse_scale_factor(&scale));
                    }
                    apply_osd_window_styles(hwnd, &pos);
                    *hwnd_setter.lock().unwrap() = Some(SafeHwnd::from_hwnd(hwnd));
                    unsafe {
                        let _ = ShowWindow(hwnd, SW_HIDE);
                    }
                    *done = true;
                    osd_log(&format!("apply_osd_window_styles done (initial pos={}, theme={}, scale={}), window primed and hidden", pos, theme, scale));
                }
            }
        },
    );

    osd_log("Entering Slint main event loop (run)");
    let _ = osd.run();
}


