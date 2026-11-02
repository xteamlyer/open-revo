# Quick Fan Boost Shortcut

> **Type**: purely declarative headless hotkey plugin (`plugin_type: "service"`)
> **Features**: zero Webview overhead, 0 MB extra memory cost, millisecond-level direct hardware access, native mecha OSD linkage

---

## Plugin features

1. **Extremely lightweight (Zero-GUI / 0 MB)**:
   This plugin never opens any web window or background resident process. It simply declares a microkernel hotkey rule in `manifest.json`, and OpenRevo injects a Ring3 low-level global keyboard hook (`WH_KEYBOARD_LL`) on its behalf.
2. **Instant full-speed fan boost toggle**:
   From any full-screen game or the desktop foreground, press **`Ctrl+Alt+F`** to instantly toggle full-speed fan boost (5400+ RPM berserk exhaust); press it again to restore the original curve.
3. **Native tactical mecha OSD popup**:
   When the hotkey fires, the OpenRevo tactical OSD notification automatically appears in the center of the screen, reporting the fan boost state in real time without blocking your view of the game.
4. **Plug-and-play, zero pollution**:
   Enable it in the OpenRevo plugin manager and it takes effect immediately. When disabled or uninstalled, the microkernel automatically unregisters every key binding within seconds, leaving no system residue.

---

## Manifest configuration (`manifest.json`)

```json
{
  "id": "shortcut-fan-boost",
  "name": "Quick Fan Boost Hotkey",
  "version": "1.0.0",
  "author": "OpenRevo Official & Community",
  "description": "Official sample plugin: a purely declarative headless global hotkey (zero Webview, zero extra memory footprint) that uses a shortcut (default Ctrl+Alt+F) to instantly toggle full-speed fan boost anytime, linked with the native mecha OSD popup.",
  "plugin_type": "service",
  "min_host_version": "0.9.3",
  "shortcuts": [
    {
      "id": "quick_fan_boost_toggle",
      "name": "Instant full-speed fan boost toggle",
      "combo": "Ctrl+Alt+F",
      "action": {
        "type": "ToggleFanBoost"
      },
      "osd": true,
      "enabled": true,
      "swallow": false
    }
  ]
}
```

---

## How to customize the hotkey

To change it to another combination (for example `Ctrl+Shift+F`, `Ctrl+F1` or `Win+F10`):
1. Open `manifest.json` in this plugin's directory;
2. Change `"combo": "Ctrl+Alt+F"` to the combination you prefer;
3. Click "Refresh" in the OpenRevo console plugin manager, or toggle this plugin off and on again, and it takes effect immediately!
