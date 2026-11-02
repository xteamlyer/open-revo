# 13th/14th Gen CPU Guardian - OpenRevo Official Plugin

> **A native anti-degradation, peak-clipping and steady-state undervolting hardware control center built for Intel 13th/14th Gen Core processors (i9-13900HX / i9-14900HX and similar).**

---

## 1. Why choose this plugin over the official Intel XTU?

Many users ask: "Since it talks to the official Intel channel under the hood, why not just use the original XTU instead of OpenRevo's CPU Guardian?"

The table below sums up the core differences in everyday use:

| Aspect | Official Intel XTU client | OpenRevo CPU Guardian |
| :--- | :--- | :--- |
| **Startup speed and size** | A several-hundred-MB installer, sluggish startup taking seconds | **A lightweight companion bridge (~1 MB)**, opens in milliseconds |
| **Background and memory footprint** | Forces a resident tray background, auto-starts several telemetry services at boot (100-300 MB RAM) | **Zero extra residents** - closing the page puts it to sleep with OpenRevo, zero memory used |
| **Learning curve and safety** | The panel lists hundreds of expert micro-tuning registers; casual users can easily misconfigure them and blue-screen | **One-click safe sweet-spot presets** (steady-state longevity, light surge protection), works out of the box |
| **True all-core turbo "peak clipping"** | Manually changing ratios easily breaks the single-core/all-core monotonicity constraints, leaving 1-Core still spiking to 1.50V+ | **All-core Active Core uniformly clipped**, completely avoiding the non-linear power cliff above 5.3GHz |
| **Anti-blue-screen safety watchdog** | No rollback protection; aggressive settings can lock you out of the system | **A built-in 30-second safety watchdog** that automatically rolls back to factory settings if the voltages turn out unstable |
| **System ecosystem integration** | An isolated standalone window, disconnected from fans, water cooling and power modes | **Seamlessly integrated** with the water-cooling hub, GPU direct output and power modes in one console |

---

## 2. Prerequisites and the official XTU installation guide

### 1. Why is the official XTU 7.x driver stack required?
Under the modern Windows 11 security architecture, the kernel voltage driver (`iocbios2.sys`) **must never be started as a bare, isolated NT service by a script** - doing so makes the driver dereference a null pointer while addressing the ACPI device object, triggering a fatal `0x50` `PAGE_FAULT_IN_NONPAGED_AREA` kernel blue screen.

It has to be attached to the board's ACPI device tree (the `SWC\XTUCOMPONENT` extension filter) and injected legitimately by the official installer. OpenRevo therefore refuses to do any risky third-party bare kernel injection and instead uses Intel's official Microsoft WHQL-certified driver service (`XTU3SERVICE`) as the secure communication base.

### 2. Official download guide (do not pick the wrong version!)
- **The only official download link**: [Intel Extreme Tuning Utility (Intel XTU) download center](https://www.intel.com/content/www/us/en/download/17881/intel-extreme-tuning-utility-intel-xtu.html)
- ⚠️ **Critical version warning**:
  - For **13th / 14th Gen Core processors (e.g. 13900HX / 14900HX)**, make sure to download and install a **7.x.x stable version** (e.g. `7.14.2.x`)!
  - **Never download the 10.x.x version!** 10.x.x is a dedicated package for the latest Core Ultra / Arrow Lake architecture only; it will fail to install on 13th/14th gen machines.

### 3. The clean, set-and-forget runtime (zero window interruptions, zero extra residents)
The official XTU 7.x is deliberately restrained by design:
- After installation, at boot it **only registers the background system service `XTU3SERVICE`; it never auto-starts any foreground window or tray icon** in "Startup apps" or "Task Scheduler";
- You **never need to manually open the original XTU client** in daily use;
- Just open OpenRevo's "CPU Guardian" as usual and the plugin automatically establishes communication with the underlying `XTU3SERVICE` in the background, giving you 100% clean, window-free hardware-grade protection!

---

## 3. Preset design philosophy

This plugin ships sweet-spot defenses validated specifically against the voltage-frequency curve (VID curve) of high-degradation processors such as the 13900HX / 14900HX:

### 1. Steady-state longevity (highly recommended)
- **P-core turbo peak clipping**: the all-core ratio is capped at `53x (5.3 GHz)`, avoiding the 5.4GHz-5.8GHz high-frequency dead zone (power rises steeply there with diminishing marginal returns, and it is the source of the deadly 1.50V+ transient surges).
- **Core Voltage Offset**: `-60 mV`, pulling the whole VID curve down and dropping full-load core temperatures by 8-12°C.
- **Ring Voltage Offset**: `0 mV` (on 14th gen HX the runtime lower bound is locked at 0 by the microcode; any negative offset keeps applying from the hardware baseline you set in the BIOS, e.g. `-50 mV`).
- **Core IccMax (transient current limit)**: capped at `280 A` (Intel's official Baseline recommendation, cutting off large dynamic current spikes).

### 2. Light surge protection
- **P-core turbo**: keeps high-frequency responsiveness, all-core capped at `55x (5.5 GHz)`.
- **Core Voltage Offset**: `-40 mV`.
- **Core IccMax**: `307 A`. Suited to machines with a good silicon lottery that still need peak single-core responsiveness.

### 3. Factory default baseline
- Clears every voltage offset and ratio cap, unconditionally and safely restoring all registers to their initial factory BIOS state.

---

## 4. FAQ and troubleshooting

### Q1: It says "Voltage tuning channel is restricted (blocked by Windows VBS virtualization security)"?
**Cause**: Intel's official security mechanism dictates that when Windows has Virtualization-Based Security (VBS / Core Isolation) enabled and Undervolt Protection (UVP) is not opened at the low level, the system blocks all MSR voltage writes.
**How to unlock**:
1. Open Windows Settings -> Privacy and security -> Windows Security -> **Core isolation**;
2. Turn **Memory integrity** off (or run `bcdedit /set hypervisorlaunchtype off` as an administrator) and reboot;
3. After the reboot the voltage tuning channel is fully unlocked (and with the virtualization overhead gone, game frame rates typically gain 3-5%).

### Q2: Are the voltage parameters cumulative? Will pressing the steady-state preset twice give -120mV?
**Absolutely not!**
The Core Voltage Offset is an "absolute target setpoint (Absolute Bias)" in the register, not a relative delta. No matter how many times you press the steady-state preset, the value written to the register is always the target `-60 mV`; switching to the light preset writes the target `-40 mV`. Nothing ever accumulates physically.

### Q3: Why is the steady-state preset button greyed out after switching or refreshing?
That is the normal foolproof protection. When the live hardware state already matches a preset exactly, that preset's button locks to `✓ Currently running` (greyed out) to prevent a pointless duplicate write. Drag the fine-tuning sliders below to change any parameter and the preset buttons unlock automatically.

---

## 5. Plugin architecture and developer notes

- `manifest.json`: the standard plugin manifest, declaring the companion service `revo-xtu-bridge.exe` port (18980) and its permissions.
- `index.html`: a minimal vanilla front end that strictly follows the OpenRevo Design System CSS conventions (dark high-contrast, rounded corners and theme support).
- `sidecar/revo-xtu-bridge/`: a lightweight REST companion bridge written in C#, exposing standardized JSON endpoints such as `/api/probe`, `/api/get`, `/api/apply` and `/api/reset`, and responsible for establishing the WCF named pipe with the official `XTU3SERVICE` across processes.
- **Persistence mechanism**: follows the OpenRevo sandboxed plugin storage engine specification; the runtime configuration is saved independently at `%APPDATA%\OpenRevo\plugin_storage\cpu-guardian\config.json`.
