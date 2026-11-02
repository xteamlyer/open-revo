# EVA-01 S² Core Tactical HUD

> **Type**: shape-shifting desktop floating widget (`plugin_type: "widget"`)
> **Audience**: EVA Unit-01 fans, cyber-mecha geeks, frequent laptop hardware tuners and heavy-load competitive gamers

---

## Plugin overview

`eva01-core` is OpenRevo's flagship shape-shifting mecha desktop floating widget. It leaves behind the boring data tables of traditional monitoring software and deeply fuses the visual language of Evangelion Unit-01 and NERV tactical instruments with the underlying hardware control of MECHREVO laptops:

* **Not just a static skin**: it connects directly to the OpenRevo microkernel hardware gateway and the adaptive telemetry bus;
* **High-frequency actions one second away**: click the core to trigger "berserk" fan-boost cooling, click the mode card to switch performance modes instantly;
* **Dual-state free folding**: smoothly morphs between a **260×190 full HUD dashboard** and a **130×42 minimal edge-hugging capsule**;
* **Pure-code Web Audio synthesized sound**: zero external audio assets, using the native Web Audio API to synthesize NERV terminal key tones and the berserk emergency alarm in milliseconds.

---

## Core features and hardware mapping matrix

| EVA-01 tactical setting | Laptop hardware mapping | Visual behavior and feedback |
| :--- | :--- | :--- |
| **S² core / Berserk** | **Full-speed fan boost (5400+ RPM)** | Click the central rotating core: the whole interface instantly turns from Unit-01 green to **bloodshot crimson**, the outer stator spins in an overclocked berserk state, with shockwave pulse effects and a short EVA emergency alarm buzz. |
| **Thermal Alert** | **CPU junction temperature, three tiers** | • `< 68°C`: **NORMAL** (the classic Unit-01 fluorescent green `#00ff66`);<br>• `68 - 81°C`: **CAUTION** (warning amber `#f59e0b`);<br>• `≥ 82°C`: **EMERGENCY** (overheat crimson `#ef4444`). |
| **Sync Rate** | **CPU power and overall system load** | Dynamatically converted from the live power draw (W) and junction temperature into a `40% - 100%` sync rate reading. |
| **Internal Battery** | **Battery level and runtime estimate** | With AC power connected it shows a green `EXTERNAL AC`; the moment you unplug, it flashes red with the classic EVA countdown `INT-BAT 03:45`. |
| **Power Mode matrix** | **Office / Balance / Turbo mode cycling** | Click the mode card in the lower left to cycle `set_power_mode`, playing the classic confirmation two-tone chime. |
| **Minimal capsule mode** | **Dynamic window geometry reshaping** | Click the minimize button and the window smoothly shrinks into a `130×42` micro capsule bar, keeping only the core temperature, fan speed and the instant fan-boost button; double-click the capsule to restore the full dashboard. |
| **Mistouch-proof drag lock** | **Win32 window position protection** | Click the 🔒/🔓 icon in the top right to lock the current desktop coordinates so the widget cannot be dragged away by accident in the heat of a game. |
| **Zero dGPU wake** | **Green, battery-friendly protection** | The manifest only declares CPU, fan and power telemetry, so during light office typing the NVIDIA dGPU stays strictly in **D3Cold 0W deep sleep**. |

---

## Directory structure

```text
eva01-core/
├── manifest.json              # Window geometry, telemetry sensor list and capability permission declarations
├── index.html                 # A single self-contained modern HTML5 window (vector SVG, Web Audio and the microkernel adapter bridge)
└── README.md                  # Plugin design and usage documentation
```

---

## Plugin manifest (`manifest.json`)

```json
{
  "id": "eva01-core",
  "name": "EVA-01 S² Energy Core",
  "version": "2.0.0",
  "author": "OpenRevo Official & Community",
  "description": "The flagship shape-shifting mecha desktop widget. Supports junction-temperature pulse breathing, fan speed linkage, unplug countdown, dual-state minimal folding and one-click berserk fan boost toggling.",
  "plugin_type": "widget",
  "entry": "index.html",
  "min_host_version": "0.9.3",
  "window": {
    "width": 260,
    "height": 190,
    "transparent": true,
    "always_on_top": true,
    "resizable": false,
    "skip_taskbar": true
  },
  "telemetry": {
    "enabled": true,
    "desiredIntervalMs": 1500,
    "sensors": [
      "cpu_temp",
      "cpu_fan_rpm",
      "cpu_power_w",
      "power_mode",
      "fan_boost",
      "battery_level",
      "is_charging"
    ]
  },
  "permissions": [
    "telemetry:read",
    "fan:control",
    "power:control"
  ]
}
```

---

## Interaction guide

1. **Drag to move**: hold any empty area of the widget or the top title bar to drag it smoothly anywhere on the screen (OpenRevo automatically remembers the last position).
2. **Position lock**: click the 🔓 icon in the top bar so it becomes 🔒 to lock dragging.
3. **Mute mode**: click the 🔊 icon to toggle it to 🔇 and turn off UI feedback sounds anytime.
4. **One-click berserk fan boost**: click the central rotating S² core or the ⚡ button on the capsule bar to instantly enter the full-speed cooling state.
5. **Switch performance modes**: click the `POWER MODE` card in the lower left to quickly cycle between Office, Balance and Turbo modes.
6. **Dual-state folding**: click the ➖ button in the top bar to shrink into the minimal capsule mode; double-click the capsule or click the ⛶ button to restore the full HUD dashboard.
