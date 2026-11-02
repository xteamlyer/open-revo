# Universal Shortcut Studio

> **Type**: main-interface tab / standalone pop-out window (`plugin_type: "tab"`)
> **Audience**: all-around geeks, esports gamers, mobile office workers and MECHREVO hardware tuning enthusiasts

---

## Plugin overview

`shortcut-workshop` is OpenRevo's official advanced global shortcut visual tuning studio. Without writing any code or compiling any dynamic library, you can record physical keys, combine modifiers, and bind hardware and system actions through the visual interface, triggering them globally from full-screen exclusive games or any foreground application at any time!

---

## Core features

1. **Live key capture and recording engine**:
   - Click "Press keys to record" and then press the shortcut on the physical keyboard (e.g. `Ctrl` + `Alt` + `F`); the modifiers and the primary key are captured automatically in milliseconds.
   - Provides a live mechanical keycap preview (`<kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>F</kbd>`).
2. **Full hardware tuning action coverage**:
   - 🌪️ **Cooling and performance**: one-click full-speed fan boost (5400+ RPM berserk), cycling performance modes, locking Office / Balanced / Turbo modes, instant high-refresh ↔ 60Hz switching.
   - 🎮 **Esports peripherals and keyboard locks**: touchpad hardware toggle, block / unblock the Win key (prevents the desktop popping up), Fn function-key lock toggling, 4-level keyboard backlight cycling.
   - 💻 **System AFK and conveniences**: one-click screen-off (power-saving downloads without sleeping), quick workstation lock, boss-key mute, volume control.
   - 🚀 **External program launch**: launch any external executable or debug script with one click.
3. **Native mecha tactical OSD popup linkage**:
   - When a hotkey fires, you can optionally pop up the tactical mecha HUD overlay at the top of the screen, keeping your view of the game clear while staying aware of hardware state changes in real time.
4. **Instant action testing (Test Action)**:
   - After configuring, click "Test the action now" to verify the hardware feedback and the OSD hint without pressing the key.
5. **One-click instant preset packs**:
   - Ships three scenario packs - [Berserk esports], [Mobile office and battery life] and [Desk slacking and anti-peeking] - all applied in bulk with one click.
6. **Dual-mode communication guarantee (Dual Gateway)**:
   - Inside the control center's embedded tab it uses the standard microkernel sandbox channel, and it natively supports the top-right [Pop-out window] for multi-screen tuning and a persistent companion while gaming.

---

## Plugin manifest (`manifest.json`)

```json
{
  "id": "shortcut-workshop",
  "name": "Universal Shortcut Studio",
  "version": "1.0.0",
  "author": "OpenRevo Official & Community",
  "description": "Official sample plugin: the full-featured global shortcut tuning studio. Supports live key capture, custom modifier combinations, bindings for hardware fan boost / performance modes / refresh rate / peripheral toggles / system AFK actions, plus live action testing and unregistration.",
  "type": "tab",
  "entry": "index.html",
  "min_host_version": "0.9.4",
  "window": {
    "width": 960,
    "height": 720,
    "resizable": true,
    "decorations": true,
    "transparent": false,
    "always_on_top": false
  },
  "permissions": [
    "shortcuts:manage",
    "power:control",
    "fan:control"
  ]
}
```
