using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32;

namespace MroAgent
{
    /// <summary>
    /// MRO 传感器代理：
    ///   1) RTSS 共享内存的 FPS / 帧时间 / 前台进程 / 1% Low
    ///   2) 系统内存占用（GlobalMemoryStatusEx）
    ///   3) 需要时自动拉起 RTSS（无需先开微星小飞机）
    /// 只读硬件，不注入任何进程，仅监听 127.0.0.1。
    /// </summary>
    internal static class Program
    {
        private const string RtssMapping = "RTSSSharedMemoryV2";
        private const int RtssSignature = 0x52545353; // 'RTSS'（MSVC 多字符常量）
        private const uint FileMapRead = 0x0004;

        private static int _port = 18946;
        private static bool _autoStartRtss = true;
        private static string _rtssPathOverride = null;
        private static string _rtssPathCache = null;
        private static DateTime _lastStartAttempt = DateTime.MinValue;
        private static bool _rtssMissingLogged = false;
        private static string _rtssStartError = null;
        private static readonly object _startLock = new object();

        private static readonly object _hudLock = new object();
        private static string _hudBg = "dark";
        private static int _hudBgAlpha = 92;
        private static int _hudOpacity = 100;
        private static bool _hudTopmost = true;
        private static bool _hudClickThrough = false;
        private static bool _hudShowLow = true;
        private static int _hudLowWindow = 60;
        // 字体透明度（只作用在文字/进度条，不影响卡片背景）
        private static int _hudTextAlpha = 100;
        // 整体缩放：窗口尺寸 = 基础尺寸 * scale，页面内容同步 scale
        private static double _hudUiScale = 1.0;
        // HUD 窗口句柄缓存（每秒的置顶守护用它，避免反复枚举窗口）
        private static IntPtr _hudHwndCache = IntPtr.Zero;
        // 显示/隐藏 HUD 的全局热键，空字符串表示不注册
        private static string _hotkey = "Ctrl+Alt+H";
        private static bool _hotkeyRegistered = false;
        private static string _hotkeyError = null;
        private static uint _hotkeyThreadId = 0;
        private static string _settingsPath = null;

        // ---------------- 1% Low 采样状态 ----------------
        // v2.2：优先读 RTSS 的逐帧帧时间数组（偏移 416，单位微秒，约 1000 帧环形缓冲）。
        //   这是和 NVIDIA FrameView / PresentMon 同一档的逐帧精度 —— 每帧一个样本，
        //   不需要靠轮询去逼近，1% Low 直接对真实逐帧分布取分位。
        //   偏移 416 来自 entry 布局：324 字节基础头 + 92 字节统计扩展 + 3000 × DWORD。
        //   读到的数据必须通过「均值换算帧率 ≈ RTSS 自报平均帧率」的校验才会被采用，
        //   校验不过就说明偏移/版本不对，自动退回下面的轮询采样。
        //
        // 回退路径（v2.1 的做法，RTSS 版本过老没有该数组时使用）：
        //   1) 以 8ms 周期读取 RTSS 帧计数器，按「累积满 3 帧或 120ms」切分样本。
        //   2) RTSS 的 dwFrames 每秒清零一次，跨越清零的采样点差值会变成负数，
        //      显式检测计数器回退并丢弃该段。
        //   3) 1% Low 用「按帧加权的 99 分位」：按帧时间降序累计到总帧数的 1%，
        //      对这些帧的帧时间做加权平均，再换算成 FPS。
        private const int LowTickMs = 8;
        private const int LowMinFramesPerBin = 3;
        private const int LowMaxMsPerBin = 120;
        private const double LowDropBinMs = 1000.0;   // 单段超过 1s 视为暂停/读条，不计入

        private const int HistoryOffset = 416;        // RTSS 逐帧帧时间数组起始偏移
        private const int HistoryMinFrames = 120;     // 少于这么多帧不认为可用
        private const int HistPollMs = 250;           // 逐帧数据的刷新间隔
        private const int HistRetryMs = 5000;         // 连续失败后的重试间隔

        private struct LowBin
        {
            public int Frames;
            public int Ms;
        }

        private static readonly object _lowLock = new object();
        private static readonly List<LowBin> _lowBins = new List<LowBin>();
        private static int _lowSpanMs = 0;
        private static int _lowPid = 0;
        private static int _lowFrames = 0;
        private static int _lowEnd = 0;
        private static int _lowPendFrames = 0;
        private static int _lowPendMs = 0;
        private static long _lowLastDataTick = 0;
        private static long _lowLastCompute = 0;
        private static double _low1Pct = 0;
        private static double _lowAvgFps = 0;
        private static int _lowFramesInWindow = 0;
        private static volatile bool _useHistory = false;
        private static int _histFails = 0;
        private static string _lowSource = "none";

        private static bool _hudRoundApplied = false;

        [DllImport("dwmapi.dll", PreserveSig = false)]
        private static extern void DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
        private const int DWMWCP_DEFAULT = 0;
        private const int DWMWCP_DONOTROUND = 1;
        private const int DWMWCP_ROUND = 2;
        private const int DWMWCP_ROUNDSMALL = 3;

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr OpenFileMapping(uint access, bool inherit, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr MapViewOfFile(IntPtr h, uint access, uint offHigh, uint offLow, UIntPtr bytes);

        [DllImport("kernel32.dll")]
        private static extern bool UnmapViewOfFile(IntPtr p);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr h);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int max);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hWnd);

        // ---- 点击穿透（WS_EX_TRANSPARENT + WS_EX_LAYERED）----
        private const int GWL_EXSTYLE = -20;
        private const long WS_EX_TRANSPARENT = 0x00000020L;
        private const long WS_EX_LAYERED = 0x00080000L;
        private const uint LWA_ALPHA = 0x00000002;

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
        private static extern IntPtr GetWindowLongPtrW(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
        private static extern IntPtr SetWindowLongPtrW(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

        // ---- 全局热键（显示/隐藏 HUD）----
        private const int WM_HOTKEY = 0x0312;
        private const uint MOD_ALT = 0x0001;
        private const uint MOD_CONTROL = 0x0002;
        private const uint MOD_SHIFT = 0x0004;
        private const uint MOD_WIN = 0x0008;
        private const uint MOD_NOREPEAT = 0x4000;
        private const int SW_HIDE = 0;
        private const int SW_SHOW = 5;
        private const int WM_APP_RELOAD_HOTKEY = 0x8000 + 1;
        private const int HOTKEY_ID = 0x4D52; // 'MR'

        [StructLayout(LayoutKind.Sequential)]
        private struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public int ptX;
            public int ptY;
            public uint lPrivate;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll")]
        private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        private static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr WindowFromPoint(POINT point);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

        [DllImport("user32.dll")]
        private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MONITORINFO
        {
            public int cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public uint dwFlags;
        }

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [StructLayout(LayoutKind.Sequential)]
        private struct MEMORYSTATUSEX
        {
            public uint dwLength;
            public uint dwMemoryLoad;
            public ulong ullTotalPhys;
            public ulong ullAvailPhys;
            public ulong ullTotalPageFile;
            public ulong ullAvailPageFile;
            public ulong ullTotalVirtual;
            public ulong ullAvailVirtual;
            public ulong ullAvailExtendedVirtual;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX buffer);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetHandleInformation(IntPtr hObject, uint dwMask, uint dwFlags);

        // 1ms 定时器分辨率：采样周期是 8ms，默认 15.6ms 的 Sleep 粒度会让
        // 一次采样跨过 3~4 帧，把单帧卡顿摊薄。只在代理运行期间生效。
        [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod")]
        private static extern uint TimeBeginPeriod(uint ms);

        [DllImport("winmm.dll", EntryPoint = "timeEndPeriod")]
        private static extern uint TimeEndPeriod(uint ms);

        private static void Main(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length)
                {
                    int p;
                    if (int.TryParse(args[i + 1], out p) && p > 0 && p < 65536) _port = p;
                }
                else if (args[i] == "--rtss-path" && i + 1 < args.Length)
                {
                    _rtssPathOverride = args[i + 1];
                }
                else if (args[i] == "--no-rtss-autostart")
                {
                    _autoStartRtss = false;
                }
            }

            try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
            catch { try { SetProcessDPIAware(); } catch { } }

            LoadHudSettings();
            AppDomain.CurrentDomain.UnhandledException += delegate { };
            try
            {
                TcpListener listener = new TcpListener(IPAddress.Loopback, _port);
                listener.Start();
                // 关键：监听 socket 不能被子进程（例如由本代理拉起的 RTSS）继承，
                // 否则代理退出后端口仍被占用，下一次启动会 bind 失败。
                try
                {
                    IntPtr socketHandle = listener.Server.Handle;
                    SetHandleInformation(socketHandle, 0x00000001, 0);
                }
                catch { }
                StartLowSampler();
                StartHotkeyThread();
                Log("listening on 127.0.0.1:" + _port + " (rtss autostart=" + _autoStartRtss + ", path=" + (RtssPath() ?? "not found") + ")");
                while (true)
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
            }
            catch (Exception ex)
            {
                Log("fatal: " + ex.Message);
            }
        }

        private static void HandleClient(object state)
        {
            TcpClient client = (TcpClient)state;
            try
            {
                client.NoDelay = true;
                client.ReceiveTimeout = 1500;
                client.SendTimeout = 2500;

                using (NetworkStream ns = client.GetStream())
                {
                    string requestLine = ReadLine(ns);
                    if (string.IsNullOrEmpty(requestLine)) return;

                    string[] parts = requestLine.Split(' ');
                    string method = parts.Length > 0 ? parts[0] : "GET";
                    string path = parts.Length > 1 ? parts[1] : "/";

                    while (true)
                    {
                        string line = ReadLine(ns);
                        if (string.IsNullOrEmpty(line)) break;
                    }

                    if (method == "OPTIONS")
                    {
                        WriteResponse(ns, 204, "text/plain; charset=utf-8", "");
                        return;
                    }

                    int status = 200;
                    string body;

                    if (path.StartsWith("/api/hud/settings"))
                    {
                        body = HandleHudSettings(path);
                    }
                    else if (path.StartsWith("/api/hud/apply"))
                    {
                        bool applied = ApplyHudTopmost();
                        body = "{\"ok\":true,\"applied\":" + (applied ? "true" : "false") + ",\"hud\":" + HudSettingsJson() + "}";
                    }
                    else if (path.StartsWith("/api/ping"))
                    {
                        body = "{\"ok\":true,\"name\":\"mro-sensors\",\"version\":\"2.2.0\"}";
                    }
                    else if (path.StartsWith("/api/rtss/start"))
                    {
                        body = HandleRtssStart();
                    }
                    else if (path.StartsWith("/api/sensors"))
                    {
                        body = BuildSensorsJson();
                    }
                    else
                    {
                        status = 404;
                        body = "{\"ok\":false,\"error\":\"not found\"}";
                    }

                    WriteResponse(ns, status, "application/json; charset=utf-8", body);
                }
            }
            catch
            {
                // 浏览器轮询主动断开是常态
            }
            finally
            {
                try { client.Close(); } catch { }
            }
        }

        private static string HandleRtssStart()
        {
            bool wasRunning = IsRtssRunning();
            bool started = false;
            string error = null;

            if (!wasRunning)
            {
                try
                {
                    started = EnsureRtss(true);
                }
                catch (Exception ex)
                {
                    error = ex.Message;
                }
            }

            bool nowRunning = IsRtssRunning();
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            sb.Append("\"ok\":true,");
            sb.Append("\"was_running\":" + (wasRunning ? "true" : "false") + ",");
            sb.Append("\"started\":" + (started ? "true" : "false") + ",");
            sb.Append("\"running\":" + (nowRunning ? "true" : "false") + ",");
            string rtssPathNow = RtssPath() ?? "";
            sb.Append("\"path\":" + JsonString(rtssPathNow));
            sb.Append(",\"bundled\":" + (IsBundledRtss(rtssPathNow) ? "true" : "false"));
            if (_rtssStartError != null) sb.Append(",\"rtss_error\":" + JsonString(_rtssStartError));
            if (error != null) sb.Append(",\"error\":" + JsonString(error));
            sb.Append("}");
            return sb.ToString();
        }

        private static string ReadLine(Stream s)
        {
            var sb = new StringBuilder();
            while (sb.Length < 4096)
            {
                int b = s.ReadByte();
                if (b < 0) break;
                if (b == '\n') break;
                if (b != '\r') sb.Append((char)b);
            }
            return sb.ToString();
        }

        private static void WriteResponse(Stream s, int status, string contentType, string body)
        {
            byte[] payload = Encoding.UTF8.GetBytes(body ?? "");
            string head =
                "HTTP/1.1 " + status + " " + (status == 200 ? "OK" : status == 204 ? "No Content" : "Not Found") + "\r\n" +
                "Content-Type: " + contentType + "\r\n" +
                "Content-Length: " + payload.Length + "\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: *\r\n" +
                "Cache-Control: no-store\r\n" +
                "Connection: close\r\n\r\n";
            byte[] header = Encoding.ASCII.GetBytes(head);
            s.Write(header, 0, header.Length);
            if (payload.Length > 0) s.Write(payload, 0, payload.Length);
            s.Flush();
        }

        private static string BuildSensorsJson()
        {
            // 首次找到 HUD 窗口时补一次圆角设置（页面可能还没调用 /api/hud/apply）
            // 只有「透明」走 LAYERED，DWM 圆角不生效，不必反复尝试
            if (!_hudRoundApplied) ApplyHudRoundCorner();

            // 每秒检查一次有没有被游戏窗口挤下去（无边框全屏时很常见）
            EnsureHudOnTop();

            double ramUsed = 0, ramTotal = 0;
            try
            {
                MEMORYSTATUSEX mem = new MEMORYSTATUSEX();
                mem.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
                if (GlobalMemoryStatusEx(ref mem))
                {
                    ramTotal = mem.ullTotalPhys / 1024.0 / 1024.0;
                    ramUsed = (mem.ullTotalPhys - mem.ullAvailPhys) / 1024.0 / 1024.0;
                }
            }
            catch { }

            bool rtssProcess = IsRtssRunning();
            if (!rtssProcess && _autoStartRtss)
            {
                try { EnsureRtss(false); } catch { }
                rtssProcess = IsRtssRunning();
            }

            int fgPid = ReadForegroundPid();
            int lowPid;
            lock (_lowLock) { lowPid = _lowPid; }

            RtssSample rt = RtssSample.Read(fgPid, lowPid, true);

            double low1, lowAvg;
            int lowBins, lowFrames, lowSpan;
            string lowSource;
            lock (_lowLock)
            {
                // 只有回退采样模式才需要现算；逐帧模式每 250ms 已经算好了
                if (!_useHistory && _lowBins.Count > 0) RecomputeLowLocked();
                low1 = _low1Pct;
                lowAvg = _lowAvgFps;
                lowBins = _lowBins.Count;
                lowFrames = _lowFramesInWindow;
                lowSpan = _lowSpanMs;
                lowSource = _lowSource;
            }

            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            sb.Append("\"ok\":true,");
            sb.Append("\"version\":\"2.2.0\",");
            sb.Append("\"ts\":" + NowMs() + ",");
            sb.Append("\"ram_used_mb\":" + F(ramUsed) + ",");
            sb.Append("\"ram_total_mb\":" + F(ramTotal) + ",");
            sb.Append("\"ram_percent\":" + F(ramTotal > 0 ? ramUsed / ramTotal * 100.0 : 0) + ",");
            sb.Append("\"rtss\":" + (rt.Available ? "true" : "false") + ",");
            sb.Append("\"rtss_running\":" + (rtssProcess ? "true" : "false") + ",");
            sb.Append("\"rtss_autostart\":" + (_autoStartRtss ? "true" : "false") + ",");
            string rtssPathNow = RtssPath() ?? "";
            sb.Append("\"rtss_path\":" + JsonString(rtssPathNow) + ",");
            sb.Append("\"rtss_bundled\":" + (IsBundledRtss(rtssPathNow) ? "true" : "false") + ",");
            // 前台是否全屏：独占全屏下 HUD 一定盖不上去，设置页据此给提示
            sb.Append("\"fullscreen\":" + (IsForegroundFullscreen() ? "true" : "false") + ",");
            if (_rtssStartError != null) sb.Append("\"rtss_error\":" + JsonString(_rtssStartError) + ",");
            sb.Append("\"fps\":" + F(rt.Fps) + ",");
            sb.Append("\"fps_1pct_low\":" + F(low1) + ",");
            sb.Append("\"fps_avg_window\":" + F(lowAvg) + ",");
            sb.Append("\"low_source\":" + JsonString(lowSource) + ",");
            sb.Append("\"low_bins\":" + lowBins + ",");
            sb.Append("\"low_frames\":" + lowFrames + ",");
            sb.Append("\"low_span_ms\":" + lowSpan + ",");
            sb.Append("\"frametime_ms\":" + F(rt.FrametimeMs) + ",");
            sb.Append("\"pid\":" + rt.Pid + ",");
            sb.Append("\"app\":" + JsonString(rt.App) + ",");
            sb.Append("\"hud\":" + HudSettingsJson());
            sb.Append("}");
            return sb.ToString();
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct PROCESSENTRY32W
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32W entry);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32W entry);

        private static bool ProcessExists(string exeName)
        {
            IntPtr snap = IntPtr.Zero;
            try
            {
                snap = CreateToolhelp32Snapshot(0x00000002, 0); // TH32CS_SNAPPROCESS
                if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return false;

                PROCESSENTRY32W entry = new PROCESSENTRY32W();
                entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));

                if (!Process32FirstW(snap, ref entry)) return false;
                do
                {
                    if (string.Equals(entry.szExeFile, exeName, StringComparison.OrdinalIgnoreCase)) return true;
                }
                while (Process32NextW(snap, ref entry));
                return false;
            }
            catch
            {
                return false;
            }
            finally
            {
                if (snap != IntPtr.Zero && snap != new IntPtr(-1)) CloseHandle(snap);
            }
        }
        private static bool IsRtssRunning()
        {
            if (ProcessExists("RTSS.exe")) return true;
            try
            {
                return Process.GetProcessesByName("RTSS").Length > 0;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>找不到 RTSS 时自动启动；force=true 时忽略冷却时间。</summary>
        private static bool EnsureRtss(bool force)
        {
            lock (_startLock)
            {
                if (IsRtssRunning()) return false;
                if (!force && (DateTime.UtcNow - _lastStartAttempt).TotalSeconds < 15) return false;
                _lastStartAttempt = DateTime.UtcNow;

                string path = RtssPath();
                if (string.IsNullOrEmpty(path) || !File.Exists(path))
                {
                    if (!_rtssMissingLogged)
                    {
                        Log("rtss start skipped: executable not found");
                        _rtssMissingLogged = true;
                    }
                    return false;
                }

                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = path;
                    psi.WorkingDirectory = Path.GetDirectoryName(path);
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = false;
                    Process p = Process.Start(psi);
                    Log("rtss started pid=" + (p != null ? p.Id.ToString() : "?") + " path=" + path);

                    // 进程起来了但立刻退出，多半是缺 VC++ 运行库（VCRUNTIME140.dll）。
                    // 这种情况 Process.Start 不会报错，必须自己看一眼才能给出有意义的提示。
                    if (p != null)
                    {
                        try
                        {
                            if (p.WaitForExit(1200) && p.ExitCode != 0)
                            {
                                _rtssStartError = "RTSS exited immediately after starting (exit=" + p.ExitCode +
                                    "); the usual cause is a missing VC++ runtime, VCRUNTIME140.dll";
                                Log("rtss exited immediately, exit=" + p.ExitCode + " path=" + path);
                            }
                            else
                            {
                                _rtssStartError = null;
                            }
                        }
                        catch { }
                    }
                    return true;
                }
                catch (Exception ex)
                {
                    Log("rtss start failed: " + ex.Message);
                    throw;
                }
            }
        }

        /// <summary>按 环境变量/参数 -> 注册表 -> 默认安装位置 -> MSI Afterburner 同级目录 -> 插件自带 的顺序找 RTSS.exe。</summary>
        private static string RtssPath()
        {
            // 缓存的路径可能被用户删掉/改名（比如卸载了 RTSS），这时要重新找
            if (_rtssPathCache != null)
            {
                if (!File.Exists(_rtssPathCache))
                {
                    _rtssPathCache = null;
                }
                else if (IsBundledRtss(_rtssPathCache))
                {
                    // 上次用的是插件自带的那份，但用户后来自己装了 RTSS —— 切回系统的，
                    // 免得两份实例抢同一块共享内存。只查两个固定位置，开销可以忽略。
                    string sys = SystemRtssPathQuick();
                    if (!string.IsNullOrEmpty(sys))
                    {
                        _rtssPathCache = sys;
                        Log("rtss switched to system install: " + sys);
                        return sys;
                    }
                    return _rtssPathCache;
                }
                else
                {
                    return _rtssPathCache;
                }
            }

            var candidates = new List<string>();

            if (!string.IsNullOrEmpty(_rtssPathOverride)) candidates.Add(_rtssPathOverride);

            string env = Environment.GetEnvironmentVariable("RTSS_PATH");
            if (!string.IsNullOrEmpty(env)) candidates.Add(env);

            AddRegistryCandidate(candidates, RegistryHive.CurrentUser, @"Software\Unwinder\RTSS", "InstallPath");
            AddRegistryCandidate(candidates, RegistryHive.CurrentUser, @"Software\Unwinder\RTSS", "Path");
            AddRegistryCandidate(candidates, RegistryHive.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\RivaTuner Statistics Server", "InstallLocation");
            AddRegistryCandidate(candidates, RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\RivaTuner Statistics Server", "InstallLocation");

            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            if (!string.IsNullOrEmpty(pf86)) candidates.Add(Path.Combine(pf86, @"RivaTuner Statistics Server\RTSS.exe"));
            if (!string.IsNullOrEmpty(pf)) candidates.Add(Path.Combine(pf, @"RivaTuner Statistics Server\RTSS.exe"));

            try
            {
                string ab = FindAfterburnerDir();
                if (!string.IsNullOrEmpty(ab))
                {
                    candidates.Add(Path.Combine(ab, @"RivaTuner Statistics Server\RTSS.exe"));
                    candidates.Add(Path.Combine(Directory.GetParent(ab).FullName, @"RivaTuner Statistics Server\RTSS.exe"));
                }
            }
            catch { }

            // 插件自带的一份（随插件目录分发，客户端不用单独装 RTSS）。
            // 放在最后当兜底：系统里已经有 RTSS 时优先用系统的，避免两份实例打架。
            string bundled = BundledRtssPath();
            if (!string.IsNullOrEmpty(bundled)) candidates.Add(bundled);

            foreach (string c in candidates)
            {
                if (string.IsNullOrWhiteSpace(c)) continue;
                string normalized = c.Trim().Trim('"');
                string p = normalized;
                if (Directory.Exists(p)) p = Path.Combine(p, "RTSS.exe");
                if (File.Exists(p))
                {
                    _rtssPathCache = p;
                    return p;
                }
            }

            return null;
        }

        /// <summary>只查两个固定的 Program Files 位置，用来判断"系统里是不是装了 RTSS"。</summary>
        private static string SystemRtssPathQuick()
        {
            try
            {
                string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                if (!string.IsNullOrEmpty(pf86))
                {
                    string p = Path.Combine(pf86, @"RivaTuner Statistics Server\RTSS.exe");
                    if (File.Exists(p)) return p;
                }
                string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                if (!string.IsNullOrEmpty(pf))
                {
                    string p = Path.Combine(pf, @"RivaTuner Statistics Server\RTSS.exe");
                    if (File.Exists(p)) return p;
                }
            }
            catch { }
            return null;
        }

        /// <summary>插件根目录（agent 的上一级，即 mro-hud）。</summary>
        private static string PluginRootDir()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                DirectoryInfo di = Directory.GetParent(baseDir);
                return di != null ? di.FullName : baseDir;
            }
            catch
            {
                return AppDomain.CurrentDomain.BaseDirectory;
            }
        }

        /// <summary>插件自带的 RTSS（mro-hud\rtss\RTSS.exe），没带则返回 null。</summary>
        private static string BundledRtssPath()
        {
            try
            {
                string p = Path.Combine(PluginRootDir(), "rtss", "RTSS.exe");
                return File.Exists(p) ? p : null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>当前用的这份 RTSS 是不是插件自带的。</summary>
        private static bool IsBundledRtss(string path)
        {
            try
            {
                string b = BundledRtssPath();
                if (string.IsNullOrEmpty(b) || string.IsNullOrEmpty(path)) return false;
                return string.Equals(Path.GetFullPath(b), Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }


        /// <summary>带缓存的 HUD 窗口句柄：句柄失效时才重新枚举，避免每秒扫一遍所有窗口。</summary>
        private static IntPtr HudWindow()
        {
            if (_hudHwndCache != IntPtr.Zero && IsWindow(_hudHwndCache)) return _hudHwndCache;
            _hudHwndCache = FindHudWindow();
            return _hudHwndCache;
        }

        /// <summary>
        /// 守护置顶：游戏切全屏/抢焦点后，HUD 常被挤到下面去（尤其无边框全屏）。
        /// 这里用 WindowFromPoint 探测 HUD 中心点是不是被别的窗口盖住了，被盖就重新置顶。
        /// 点击穿透时 WindowFromPoint 必然返回下层窗口，那种情况跳过。
        /// </summary>
        private static void EnsureHudOnTop()
        {
            if (!_hudTopmost) return;
            if (_hudClickThrough && _hudTopmost) return;
            IntPtr hud = HudWindow();
            if (hud == IntPtr.Zero || !IsWindowVisible(hud)) return;

            try
            {
                RECT r;
                if (!GetWindowRect(hud, out r)) return;
                POINT pt = new POINT();
                pt.X = (r.Left + r.Right) / 2;
                pt.Y = (r.Top + r.Bottom) / 2;

                IntPtr top = WindowFromPoint(pt);
                if (top == IntPtr.Zero || top == hud) return;

                // 被遮挡：重新提到最前（不改位置/尺寸、不抢焦点）
                SetWindowPos(hud, HWND_TOPMOST, 0, 0, 0, 0,
                    0x0001 | 0x0002 | 0x0010); // NOSIZE | NOMOVE | NOACTIVATE
                Log("hud re-topped (covered by 0x" + top.ToInt64().ToString("X") + ")");
            }
            catch { }
        }

        /// <summary>
        /// 前台窗口是否铺满整个显示器。独占全屏（DirectFlip/全屏独占）时任何窗口都盖不上去，
        /// HUD 必然看不见 —— 只能提示用户改用无边框全屏。
        /// </summary>
        private static bool IsForegroundFullscreen()
        {
            try
            {
                IntPtr fg = GetForegroundWindow();
                if (fg == IntPtr.Zero) return false;
                RECT r;
                if (!GetWindowRect(fg, out r)) return false;

                IntPtr mon = MonitorFromWindow(fg, 2); // MONITOR_DEFAULTTONEAREST
                if (mon == IntPtr.Zero) return false;
                MONITORINFO mi = new MONITORINFO();
                mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
                if (!GetMonitorInfo(mon, ref mi)) return false;

                return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top &&
                       r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
            }
            catch
            {
                return false;
            }
        }

        private static void AddRegistryCandidate(List<string> list, RegistryHive hive, string subKey, string valueName)
        {
            try
            {
                using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64))
                using (RegistryKey key = baseKey.OpenSubKey(subKey))
                {
                    if (key == null) return;
                    object v = key.GetValue(valueName);
                    if (v != null) list.Add(v.ToString());
                }
            }
            catch { }
            try
            {
                using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, RegistryView.Registry32))
                using (RegistryKey key = baseKey.OpenSubKey(subKey))
                {
                    if (key == null) return;
                    object v = key.GetValue(valueName);
                    if (v != null) list.Add(v.ToString());
                }
            }
            catch { }
        }

        private static string FindAfterburnerDir()
        {
            try
            {
                foreach (Process p in Process.GetProcessesByName("MSIAfterburner"))
                {
                    try
                    {
                        string f = p.MainModule.FileName;
                        if (!string.IsNullOrEmpty(f)) return Path.GetDirectoryName(f);
                    }
                    catch { }
                }
            }
            catch { }
            return null;
        }

        private static int ReadForegroundPid()
        {
            try
            {
                IntPtr hwnd = GetForegroundWindow();
                if (hwnd != IntPtr.Zero)
                {
                    int pid;
                    GetWindowThreadProcessId(hwnd, out pid);
                    return pid;
                }
            }
            catch { }
            return 0;
        }

        // ================= 1% Low 采样器 =================

        private static void StartLowSampler()
        {
            Thread t = new Thread(LowSamplerLoop);
            t.IsBackground = true;
            t.Name = "mro-low1-sampler";
            t.Start();
        }

        private static void LowSamplerLoop()
        {
            try { TimeBeginPeriod(1); } catch { }
            Stopwatch clock = Stopwatch.StartNew();
            long next = 0;
            long nextHist = 0;

            while (true)
            {
                long now = clock.ElapsedMilliseconds;
                try
                {
                    if (!_useHistory)
                    {
                        // 回退路径：轮询帧计数器逼近逐帧
                        SampleOnce();
                    }

                    if (now >= nextHist)
                    {
                        nextHist = now + (_histFails >= 4 ? HistRetryMs : HistPollMs);
                        UpdateFromHistory();
                    }
                }
                catch { }

                next += (_useHistory ? 60 : LowTickMs);
                long remain = next - clock.ElapsedMilliseconds;
                if (remain > 1)
                {
                    Thread.Sleep((int)remain);
                }
                else if (remain < -LowTickMs * 20)
                {
                    // 线程被长时间挂起（休眠/换页），重新对齐节拍，避免补跑
                    next = clock.ElapsedMilliseconds;
                }
            }
        }

        /// <summary>读取 RTSS 的逐帧帧时间数组并直接算出 1% Low。失败则退回到轮询采样。</summary>
        private static void UpdateFromHistory()
        {
            int fg = ReadForegroundPid();
            int prevPid;
            lock (_lowLock) { prevPid = _lowPid; }

            RtssSample.FrameHistory h = RtssSample.ReadHistory(fg, prevPid);

            lock (_lowLock)
            {
                if (!h.Available)
                {
                    _histFails++;
                    if (_histFails >= 4 && _useHistory)
                    {
                        // 逐帧数据连续拿不到：切回轮询，并清掉逐帧留下的状态
                        _useHistory = false;
                        ResetLowLocked();
                        _lowSource = "polling";
                    }
                    else if (!_useHistory)
                    {
                        _lowSource = "polling";
                    }
                    return;
                }

                _histFails = 0;
                _useHistory = true;
                _lowPid = h.Pid;
                _lowBins.Clear();

                double low1, avg, spanMs;
                int used;
                ComputeFromHistory(h.FtUs, h.Count, _hudLowWindow, out low1, out avg, out spanMs, out used);

                _low1Pct = low1;
                _lowAvgFps = avg;
                _lowSpanMs = (int)spanMs;
                _lowFramesInWindow = used;
                _lowSource = "rtss_history";
            }
        }

        /// <summary>
        /// 逐帧分布 → 1% Low：按帧时间降序取最差 1% 的帧做算术平均，再换算 FPS。
        /// windowSeconds 只用来限制参与统计的帧数（帧数上限 = 窗口秒数 × 平均帧率）。
        /// </summary>
        private static void ComputeFromHistory(int[] ftUs, int count, int windowSeconds,
                                               out double low1, out double avgFps,
                                               out double spanMs, out int usedFrames)
        {
            low1 = 0;
            avgFps = 0;
            spanMs = 0;
            usedFrames = 0;

            if (ftUs == null || count <= 0) return;
            if (count > ftUs.Length) count = ftUs.Length;

            double sum = 0;
            for (int i = 0; i < count; i++) sum += ftUs[i];
            if (sum <= 0) return;

            double meanUs = sum / count;
            double estFps = 1000000.0 / meanUs;

            int maxFrames = (int)(windowSeconds * estFps);
            if (maxFrames < 60) maxFrames = 60;

            int[] picked;
            int n;
            if (count <= maxFrames)
            {
                picked = ftUs;
                n = count;
            }
            else
            {
                // 超过窗口就均匀抽帧（逐帧数组是无序环形缓冲，抽样比截断更无偏）
                n = maxFrames;
                picked = new int[n];
                for (int i = 0; i < n; i++)
                {
                    int src = (int)((long)i * count / n);
                    if (src >= count) src = count - 1;
                    picked[i] = ftUs[src];
                }
            }

            long totalUs = 0;
            for (int i = 0; i < n; i++) totalUs += picked[i];
            if (totalUs <= 0) return;

            usedFrames = n;
            spanMs = totalUs / 1000.0;
            avgFps = n * 1000000.0 / totalUs;

            int[] sorted = new int[n];
            Array.Copy(picked, sorted, n);
            Array.Sort(sorted);
            // sorted 升序 → 最差的帧在末尾
            int need = (int)Math.Ceiling(n * 0.01);
            if (need < 1) need = 1;
            if (need > n) need = n;

            long worstUs = 0;
            for (int i = n - need; i < n; i++) worstUs += sorted[i];
            double worstMeanUs = (double)worstUs / need;
            if (worstMeanUs <= 0) return;

            low1 = 1000000.0 / worstMeanUs;
        }

        private static void SampleOnce()
        {
            int fg = ReadForegroundPid();
            int prevPid;
            lock (_lowLock) { prevPid = _lowPid; }

            // 采样线程只关心帧计数与时间戳，跳过进程名查询（那是热路径里最贵的一步）
            RtssSample s = RtssSample.Read(fg, prevPid, false);
            long nowTick = Environment.TickCount;

            lock (_lowLock)
            {
                if (!s.Available || s.Pid <= 0)
                {
                    // 没有可用的游戏条目：超过 3 秒没数据就清空，避免旧值一直挂着
                    if (_lowPid != 0 && nowTick - _lowLastDataTick > 3000) ResetLowLocked();
                    return;
                }

                if (s.Pid != _lowPid)
                {
                    // 换了游戏进程：整窗重来
                    ResetLowLocked();
                    _lowPid = s.Pid;
                    _lowFrames = s.Frames;
                    _lowEnd = s.EndTime;
                    _lowLastDataTick = nowTick;
                    return;
                }

                _lowLastDataTick = nowTick;

                int df = s.Frames - _lowFrames;
                int dt = s.EndTime - _lowEnd;

                if (dt <= 0 && df <= 0) return;

                if (df < 0 || dt <= 0)
                {
                    // RTSS 每秒把 dwFrames 清零一次：跨越清零的这一段丢弃，
                    // 否则会得到「半截帧数 / 整段时长」这种翻倍的假帧时间。
                    _lowFrames = s.Frames;
                    _lowEnd = s.EndTime;
                    _lowPendFrames = 0;
                    _lowPendMs = 0;
                    return;
                }

                _lowPendFrames += df;
                _lowPendMs += dt;
                _lowFrames = s.Frames;
                _lowEnd = s.EndTime;

                if (_lowPendFrames >= LowMinFramesPerBin || _lowPendMs >= LowMaxMsPerBin)
                {
                    FlushLowBinLocked();
                }
            }
        }

        private static void FlushLowBinLocked()
        {
            int frames = _lowPendFrames;
            int ms = _lowPendMs;
            _lowPendFrames = 0;
            _lowPendMs = 0;

            if (frames <= 0 || ms <= 0) return;

            // 单段过长 = 暂停 / 读条 / 切出，不算卡顿，直接丢弃
            if (ms > LowDropBinMs) return;

            double ft = (double)ms / frames;
            if (ft < 0.2 || ft > 500.0) return;

            LowBin bin = new LowBin();
            bin.Frames = frames;
            bin.Ms = ms;
            _lowBins.Add(bin);
            _lowSpanMs += ms;

            int windowMs = _hudLowWindow * 1000;
            while (_lowSpanMs > windowMs && _lowBins.Count > 2)
            {
                _lowSpanMs -= _lowBins[0].Ms;
                _lowBins.RemoveAt(0);
            }
            // 硬上限，防御异常 fps 把列表撑爆
            while (_lowBins.Count > 8192)
            {
                _lowSpanMs -= _lowBins[0].Ms;
                _lowBins.RemoveAt(0);
            }

            // 高帧率下每 3 帧就 flush 一次，排序不能跟着跑满 20Hz，节流到 200ms
            long now = Environment.TickCount;
            if (now - _lowLastCompute >= 200 || now < _lowLastCompute)
            {
                _lowLastCompute = now;
                RecomputeLowLocked();
            }
        }

        /// <summary>按帧加权的 99 分位：累计最差 1% 的帧，取其帧时间加权平均后换算 FPS。</summary>
        private static void RecomputeLowLocked()
        {
            int totalFrames = 0;
            for (int i = 0; i < _lowBins.Count; i++) totalFrames += _lowBins[i].Frames;
            _lowFramesInWindow = totalFrames;

            if (totalFrames < 60 || _lowBins.Count < 3)
            {
                _low1Pct = 0;
                _lowAvgFps = 0;
                return;
            }

            int totalMs = 0;
            for (int i = 0; i < _lowBins.Count; i++) totalMs += _lowBins[i].Ms;
            _lowAvgFps = totalMs > 0 ? totalFrames * 1000.0 / totalMs : 0;

            LowBin[] sorted = _lowBins.ToArray();
            Array.Sort(sorted, delegate(LowBin a, LowBin b)
            {
                double fa = (double)a.Ms / a.Frames;
                double fb = (double)b.Ms / b.Frames;
                return fb.CompareTo(fa); // 帧时间降序：最差的排前面
            });

            int need = (int)Math.Ceiling(totalFrames * 0.01);
            if (need < 1) need = 1;

            int got = 0;
            long gotMs = 0;
            for (int i = 0; i < sorted.Length && got < need; i++)
            {
                int take = sorted[i].Frames;
                if (got + take > need) take = need - got;
                got += take;
                gotMs += (long)Math.Round((double)sorted[i].Ms * take / sorted[i].Frames);
            }

            if (got <= 0 || gotMs <= 0)
            {
                _low1Pct = 0;
                return;
            }

            double avgFt = (double)gotMs / got;
            _low1Pct = avgFt > 0 ? 1000.0 / avgFt : 0;
        }

        private static void ResetLowLocked()
        {
            _lowBins.Clear();
            _lowSpanMs = 0;
            _lowPid = 0;
            _lowFrames = 0;
            _lowEnd = 0;
            _lowPendFrames = 0;
            _lowPendMs = 0;
            _low1Pct = 0;
            _lowAvgFps = 0;
            _lowFramesInWindow = 0;
            _lowSource = _useHistory ? "rtss_history" : "polling";
        }

        // ================= 设置持久化 =================

        private static string SettingsPath()
        {
            if (_settingsPath != null) return _settingsPath;
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                DirectoryInfo di = Directory.GetParent(baseDir);
                string pluginDir = di != null ? di.FullName : baseDir;
                _settingsPath = Path.Combine(pluginDir, "settings.ini");
            }
            catch
            {
                _settingsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "settings.ini");
            }
            return _settingsPath;
        }

        private static void LoadHudSettings()
        {
            try
            {
                string file = SettingsPath();
                if (!File.Exists(file)) return;
                foreach (string line in File.ReadAllLines(file))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string k = line.Substring(0, eq).Trim();
                    string v = line.Substring(eq + 1).Trim();
                    if (k == "bg")
                    {
                        if (v == "dark" || v == "glass" || v == "none" || v == "clear") _hudBg = v;
                        else if (v == "transparent") _hudBg = "glass"; // 旧配置迁移
                    }
                    else if (k == "bg_alpha")
                    {
                        int iv;
                        if (int.TryParse(v, out iv)) _hudBgAlpha = Math.Max(0, Math.Min(100, iv));
                    }
                    else if (k == "opacity")
                    {
                        int iv;
                        if (int.TryParse(v, out iv)) _hudOpacity = Math.Max(30, Math.Min(100, iv));
                    }
                    else if (k == "topmost")
                    {
                        _hudTopmost = (v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase));
                    }
                    else if (k == "click_through")
                    {
                        _hudClickThrough = (v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase));
                    }
                    else if (k == "show_low")
                    {
                        _hudShowLow = (v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase));
                    }
                    else if (k == "low_window")
                    {
                        int iv;
                        if (int.TryParse(v, out iv)) _hudLowWindow = Math.Max(10, Math.Min(120, iv));
                    }
                    else if (k == "hotkey")
                    {
                        _hotkey = v;
                    }
                    else if (k == "text_alpha")
                    {
                        int iv;
                        if (int.TryParse(v, out iv)) _hudTextAlpha = Math.Max(20, Math.Min(100, iv));
                    }
                    else if (k == "ui_scale")
                    {
                        double dv;
                        if (double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out dv))
                            _hudUiScale = Math.Max(0.7, Math.Min(1.6, dv));
                    }
                }
                Log("hud settings loaded: bg=" + _hudBg + " alpha=" + _hudBgAlpha + " opacity=" + _hudOpacity +
                    " topmost=" + _hudTopmost + " show_low=" + _hudShowLow + " low_window=" + _hudLowWindow);
            }
            catch (Exception ex)
            {
                Log("hud settings load failed: " + ex.Message);
            }
        }

        private static void SaveHudSettings()
        {
            try
            {
                string file = SettingsPath();
                string dir = Path.GetDirectoryName(file);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllLines(file, new string[]
                {
                    "bg=" + _hudBg,
                    "bg_alpha=" + _hudBgAlpha,
                    "opacity=" + _hudOpacity,
                    "topmost=" + (_hudTopmost ? "1" : "0"),
                    "click_through=" + (_hudClickThrough ? "1" : "0"),
                    "show_low=" + (_hudShowLow ? "1" : "0"),
                    "low_window=" + _hudLowWindow,
                    "hotkey=" + _hotkey,
                    "text_alpha=" + _hudTextAlpha,
                    "ui_scale=" + _hudUiScale.ToString("0.###", CultureInfo.InvariantCulture)
                });
            }
            catch (Exception ex)
            {
                Log("hud settings save failed: " + ex.Message);
            }
        }

        private static string HudSettingsJson()
        {
            return "{\"bg\":\"" + _hudBg + "\",\"bg_alpha\":" + _hudBgAlpha +
                   ",\"opacity\":" + _hudOpacity + ",\"topmost\":" + (_hudTopmost ? "true" : "false") +
                   ",\"click_through\":" + (_hudClickThrough ? "true" : "false") +
                   ",\"show_low\":" + (_hudShowLow ? "true" : "false") +
                   ",\"low_window\":" + _hudLowWindow +
                   ",\"hotkey\":" + JsonString(_hotkey) +
                   ",\"hotkey_ok\":" + (_hotkeyRegistered ? "true" : "false") +
                   ",\"hotkey_error\":" + JsonString(_hotkeyError ?? "") +
                   ",\"text_alpha\":" + _hudTextAlpha +
                   ",\"ui_scale\":" + _hudUiScale.ToString("0.###", CultureInfo.InvariantCulture) + "}";
        }

        private static string QueryValue(string path, string key)
        {
            int q = path.IndexOf('?');
            if (q < 0) return null;
            string query = path.Substring(q + 1);
            foreach (string part in query.Split('&'))
            {
                int eq = part.IndexOf('=');
                if (eq <= 0) continue;
                if (string.Equals(part.Substring(0, eq), key, StringComparison.OrdinalIgnoreCase))
                    return Uri.UnescapeDataString(part.Substring(eq + 1));
            }
            return null;
        }

        private static int ClampInt(string raw, int fallback, int min, int max)
        {
            int value;
            if (raw == null || !int.TryParse(raw, out value)) return fallback;
            if (value < min) value = min;
            if (value > max) value = max;
            return value;
        }

        private static string HandleHudSettings(string path)
        {
            bool lowWindowChanged = false;

            lock (_hudLock)
            {
                string bg = QueryValue(path, "bg");
                if (!string.IsNullOrEmpty(bg))
                {
                    bg = bg.ToLowerInvariant();
                    if (bg == "dark" || bg == "glass" || bg == "none" || bg == "clear") _hudBg = bg;
                    else if (bg == "transparent") _hudBg = "glass"; // 旧配置迁移
                }

                _hudBgAlpha = ClampInt(QueryValue(path, "bg_alpha"), _hudBgAlpha, 0, 100);
                _hudOpacity = ClampInt(QueryValue(path, "opacity"), _hudOpacity, 30, 100);

                int newWindow = ClampInt(QueryValue(path, "low_window"), _hudLowWindow, 10, 120);
                if (newWindow != _hudLowWindow)
                {
                    _hudLowWindow = newWindow;
                    lowWindowChanged = true;
                }

                string top = QueryValue(path, "topmost");
                if (!string.IsNullOrEmpty(top))
                {
                    if (top == "1" || top.Equals("true", StringComparison.OrdinalIgnoreCase)) _hudTopmost = true;
                    else if (top == "0" || top.Equals("false", StringComparison.OrdinalIgnoreCase)) _hudTopmost = false;
                }

                string ct = QueryValue(path, "click_through");
                if (!string.IsNullOrEmpty(ct))
                {
                    if (ct == "1" || ct.Equals("true", StringComparison.OrdinalIgnoreCase)) _hudClickThrough = true;
                    else if (ct == "0" || ct.Equals("false", StringComparison.OrdinalIgnoreCase)) _hudClickThrough = false;
                }

                string low = QueryValue(path, "show_low");
                if (!string.IsNullOrEmpty(low))
                {
                    if (low == "1" || low.Equals("true", StringComparison.OrdinalIgnoreCase)) _hudShowLow = true;
                    else if (low == "0" || low.Equals("false", StringComparison.OrdinalIgnoreCase)) _hudShowLow = false;
                }

                string hk = QueryValue(path, "hotkey");
                if (hk != null)
                {
                    hk = hk.Trim();
                    if (hk != _hotkey)
                    {
                        _hotkey = hk;
                        ReloadHotkey();
                    }
                }

                string ta = QueryValue(path, "text_alpha");
                if (!string.IsNullOrEmpty(ta))
                {
                    _hudTextAlpha = ClampInt(ta, _hudTextAlpha, 20, 100);
                }

                string us = QueryValue(path, "ui_scale");
                if (!string.IsNullOrEmpty(us))
                {
                    double dv;
                    if (double.TryParse(us, NumberStyles.Float, CultureInfo.InvariantCulture, out dv))
                    {
                        double clamped = Math.Max(0.7, Math.Min(1.6, dv));
                        if (Math.Abs(clamped - _hudUiScale) > 0.001)
                        {
                            _hudUiScale = clamped;
                        }
                    }
                }

                SaveHudSettings();
            }

            if (lowWindowChanged)
            {
                lock (_lowLock)
                {
                    int windowMs = _hudLowWindow * 1000;
                    while (_lowSpanMs > windowMs && _lowBins.Count > 2)
                    {
                        _lowSpanMs -= _lowBins[0].Ms;
                        _lowBins.RemoveAt(0);
                    }
                    RecomputeLowLocked();
                }
            }

            bool applied = ApplyHudTopmost();
            return "{\"ok\":true,\"applied\":" + (applied ? "true" : "false") + ",\"hud\":" + HudSettingsJson() + "}";
        }

        /// <summary>
        /// 按 ui_scale 调整 HUD 窗口尺寸：基础 490×104，窗口和页面内容同时缩放。
        /// 页面那边 .inner 固定 490×104 再缩放，两边必须严格同步，
        /// 否则会出现内容被裁掉、或者窗口大了内容没跟上而四周留白。
        /// </summary>
        private static void ApplyHudWindowSize()
        {
            IntPtr found = FindHudWindow();
            if (found == IntPtr.Zero) return;
            try
            {
                // 基础尺寸要和 mro-hud/index.html 里 .inner 的 width/height 一致（CSS 像素）。
                // 关键：SetWindowPos 用的是物理像素，而页面按 CSS 像素布局，
                // 在 125% 缩放的屏幕上两者差 1.25 倍 —— 不乘 DPI 的话
                // 窗口会偏小 20%，内容直接溢出被裁掉。
                double dpiScale = 1.0;
                try
                {
                    uint dpi = GetDpiForWindow(found);
                    if (dpi > 0) dpiScale = dpi / 96.0;
                }
                catch { }

                int w = (int)Math.Round(490 * _hudUiScale * dpiScale);
                int h = (int)Math.Round(104 * _hudUiScale * dpiScale);

                // 已经是目标尺寸就别重复 SetWindowPos（否则每次轮询都打断拖动）
                RECT r;
                if (GetWindowRect(found, out r) &&
                    (r.Right - r.Left) == w && (r.Bottom - r.Top) == h)
                {
                    return;
                }

                // 以中心为基准缩放：直接 NOMOVE 会变成"左上角不动、向右下膨胀"，
                // 连续拖滑块时窗口会一路往右下跑。
                int x = 0, y = 0;
                uint flags = 0x0004 | 0x0010; // SWP_NOZORDER | SWP_NOACTIVATE
                if (GetWindowRect(found, out r))
                {
                    x = (r.Left + r.Right) / 2 - w / 2;
                    y = (r.Top + r.Bottom) / 2 - h / 2;
                }
                else
                {
                    flags |= 0x0002; // 拿不到位置就退回 NOMOVE
                }

                SetWindowPos(found, IntPtr.Zero, x, y, w, h, flags);
                Log("hud size -> " + w + "x" + h + " at " + x + "," + y +
                    " (scale=" + _hudUiScale.ToString("0.###", CultureInfo.InvariantCulture) + ")");
            }
            catch (Exception ex)
            {
                Log("hud size failed: " + ex.Message);
            }
        }

        /// <summary>
        /// 为 HUD 窗口启用 DWM 圆角（Windows 11 原生抗锯齿圆角）。
        /// 只在首次找到窗口时执行一次，避免重复调用。
        /// </summary>
        private static bool ApplyHudRoundCorner()
        {
            if (_hudRoundApplied) return true;
            IntPtr found = FindHudWindow();
            if (found == IntPtr.Zero) return false;
            try
            {
                int val = DWMWCP_ROUND;
                DwmSetWindowAttribute(found, DWMWA_WINDOW_CORNER_PREFERENCE, ref val, sizeof(int));
                _hudRoundApplied = true;
                Log("hud round corner applied");
                return true;
            }
            catch
            {
                return false;
            }
        }

        /// <summary>按标题找到 HUD 窗口（提取为共用方法）。</summary>
        private static IntPtr FindHudWindow()
        {
            IntPtr found = IntPtr.Zero;
            try
            {
                EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
                {
                    StringBuilder sb = new StringBuilder(512);
                    GetWindowTextW(hWnd, sb, 512);
                    string title = sb.ToString();
                    // The HUD window is titled "MRO HUD"; the settings tab window is titled
                    // "MRO HUD · Settings" (or the Chinese equivalent) and must be excluded.
                    bool isHud = title.IndexOf("HUD", StringComparison.OrdinalIgnoreCase) >= 0
                                 && title.IndexOf("设置", StringComparison.Ordinal) < 0
                                 && title.IndexOf("Settings", StringComparison.OrdinalIgnoreCase) < 0;
                    if (isHud)
                    {
                        found = hWnd;
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
            return found;
        }

        /// <summary>
        /// 按标题找到 OpenRevo 的 MRO HUD 窗口，套用/取消 WS_EX_TOPMOST。
        /// 窗口标题来自插件清单的 name，改名后要能继续命中，所以这里匹配得宽松一些：
        /// 标题含 HUD 且不含「设置」—— 把同组的「MRO HUD · 设置」页签排除掉。
        /// </summary>
        private static bool ApplyHudTopmost()
        {
            IntPtr found = FindHudWindow();
            if (found == IntPtr.Zero) return false;

            // 同时把圆角也带上（首次命中时）
            ApplyHudRoundCorner();

            try
            {
                // 透明 / 穿透都靠扩展样式，统一在这里处理
                ApplyHudWindowStyle(found);
                // 缩放不是 1 时把窗口尺寸也对上（首次找到窗口时同步一次）
                // 不管 scale 是多少都要对一次：上次放大过、这次回到 100% 时，
                // 窗口还停在旧尺寸就会出现"内容缩回去了、窗口还是大的"留白。
                ApplyHudWindowSize();

                IntPtr insertAfter = _hudTopmost ? new IntPtr(-1) : new IntPtr(-2);
                return SetWindowPos(found, insertAfter, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// 统一处理 HUD 窗口的扩展样式。
        /// 透明不再由这里控制：清单里 window.transparent = true，宿主用 DirectComposition
        /// 逐像素合成，页面里哪块透明就透出游戏、哪块不透明就实打实显示。
        /// 这里只负责「点击穿透」（WS_EX_TRANSPARENT），并清掉历史版本可能残留的
        /// WS_EX_LAYERED —— 整窗 alpha 会把文字一起变淡，已经不是我们要的路径了。
        /// </summary>
        private static void ApplyHudWindowStyle(IntPtr hWnd)
        {
            try
            {
                long ex = GetWindowLongPtrW(hWnd, GWL_EXSTYLE).ToInt64();
                bool wantClickThrough = _hudClickThrough && _hudTopmost;

                long target = ex;
                // 不再走整窗 alpha 模式，清掉 LAYERED，让 DirectComposition 逐像素透明生效
                target &= ~WS_EX_LAYERED;
                if (wantClickThrough) target |= WS_EX_TRANSPARENT;
                else target &= ~WS_EX_TRANSPARENT;

                if (target != ex)
                {
                    SetWindowLongPtrW(hWnd, GWL_EXSTYLE, new IntPtr(target));
                    Log("hud exstyle 0x" + (ex & 0xFFFFFFFF).ToString("X8") +
                        " -> 0x" + (target & 0xFFFFFFFF).ToString("X8") +
                        " (bg=" + _hudBg + " click_through=" + wantClickThrough + ")");
                }

                // 不再调用 SetLayeredWindowAttributes：透明由页面 + DirectComposition 决定。
                // 之前 LAYERED 下 DWM 圆角不生效，这里统一重套一次圆角。
                _hudRoundApplied = false;
                ApplyHudRoundCorner();
            }
            catch (Exception ex)
            {
                Log("hud window style failed: " + ex.Message);
            }
        }

        // ================= 全局热键：显示/隐藏 HUD =================

        /// <summary>把 "Ctrl+Alt+H" 这样的字符串解析成 RegisterHotKey 需要的修饰键与虚拟键码。</summary>
        private static bool ParseHotkey(string s, out uint mods, out uint vk)
        {
            mods = 0;
            vk = 0;
            if (string.IsNullOrWhiteSpace(s)) return false;

            string[] parts = s.Split('+');
            if (parts.Length < 2) return false; // 必须带修饰键，否则会吃掉正常按键

            foreach (string raw in parts)
            {
                string p = raw.Trim().ToUpperInvariant();
                if (p.Length == 0) return false;

                if (p == "CTRL" || p == "CONTROL") { mods |= MOD_CONTROL; continue; }
                if (p == "ALT") { mods |= MOD_ALT; continue; }
                if (p == "SHIFT") { mods |= MOD_SHIFT; continue; }
                if (p == "WIN" || p == "META") { mods |= MOD_WIN; continue; }

                if (p.Length == 1 && p[0] >= 'A' && p[0] <= 'Z') { vk = p[0]; continue; }
                if (p.Length == 1 && p[0] >= '0' && p[0] <= '9') { vk = p[0]; continue; }

                if (p.Length >= 2 && p[0] == 'F')
                {
                    int fn;
                    if (int.TryParse(p.Substring(1), out fn) && fn >= 1 && fn <= 24)
                    {
                        vk = (uint)(0x70 + fn - 1);
                        continue;
                    }
                }
                return false;
            }
            return mods != 0 && vk != 0;
        }

        /// <summary>注册当前设置的快捷键（必须在热键线程里调用）。</summary>
        private static void ApplyHotkey()
        {
            if (_hotkeyRegistered)
            {
                UnregisterHotKey(IntPtr.Zero, HOTKEY_ID);
                _hotkeyRegistered = false;
            }

            if (string.IsNullOrWhiteSpace(_hotkey))
            {
                _hotkeyError = null;
                Log("hotkey disabled");
                return;
            }

            uint mods, vk;
            if (!ParseHotkey(_hotkey, out mods, out vk))
            {
                _hotkeyError = "Invalid hotkey format: " + _hotkey;
                Log("hotkey parse failed: " + _hotkey);
                return;
            }

            if (RegisterHotKey(IntPtr.Zero, HOTKEY_ID, mods | MOD_NOREPEAT, vk))
            {
                _hotkeyRegistered = true;
                _hotkeyError = null;
                Log("hotkey registered: " + _hotkey);
            }
            else
            {
                _hotkeyError = "The hotkey may be occupied by another program: " + _hotkey;
                Log("hotkey register failed: " + _hotkey + " err=" + Marshal.GetLastWin32Error());
            }
        }

        /// <summary>切换 HUD 窗口的显示状态。</summary>
        private static void ToggleHudVisible()
        {
            IntPtr hud = FindHudWindow();
            if (hud == IntPtr.Zero)
            {
                Log("hotkey: hud window not found");
                return;
            }
            bool visible = IsWindowVisible(hud);
            ShowWindow(hud, visible ? SW_HIDE : SW_SHOW);
            Log("hotkey toggled hud -> " + (visible ? "hidden" : "shown"));
        }

        /// <summary>热键线程：注册快捷键并跑消息循环（RegisterHotKey 要求同线程有消息泵）。</summary>
        private static void HotkeyLoop()
        {
            _hotkeyThreadId = GetCurrentThreadId();
            ApplyHotkey();

            MSG msg;
            while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
            {
                if (msg.message == WM_HOTKEY)
                {
                    try { ToggleHudVisible(); }
                    catch (Exception ex) { Log("hotkey toggle failed: " + ex.Message); }
                }
                else if (msg.message == (uint)WM_APP_RELOAD_HOTKEY)
                {
                    ApplyHotkey();
                }
            }
        }

        private static void StartHotkeyThread()
        {
            Thread t = new Thread(HotkeyLoop);
            t.IsBackground = true;
            t.Name = "hotkey";
            t.Start();
        }

        /// <summary>设置页改了快捷键后，通知热键线程重新注册。</summary>
        private static void ReloadHotkey()
        {
            if (_hotkeyThreadId != 0)
            {
                PostThreadMessage(_hotkeyThreadId, (uint)WM_APP_RELOAD_HOTKEY, IntPtr.Zero, IntPtr.Zero);
            }
        }

        private static long NowMs()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
        }

        private static string F(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v) || v < 0) v = 0;
            return v.ToString("0.##", CultureInfo.InvariantCulture);
        }

        private static string JsonString(string s)
        {
            if (string.IsNullOrEmpty(s)) return "\"\"";
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                if (c == '\\') sb.Append("\\\\");
                else if (c == '"') sb.Append("\\\"");
                else if (c < 32) sb.Append(' ');
                else sb.Append(c);
            }
            sb.Append("\"");
            return sb.ToString();
        }

        private static void Log(string message)
        {
            try
            {
                string dir = AppDomain.CurrentDomain.BaseDirectory;
                File.AppendAllText(Path.Combine(dir, "agent.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine);
            }
            catch { }
        }

        private struct RtssSample
        {
            public bool Available;
            public double Fps;
            public double FrametimeMs;
            public int Pid;
            public string App;
            public int Frames;
            public int EndTime;

            /// <summary>逐帧帧时间数组的读取结果。</summary>
            public struct FrameHistory
            {
                public bool Available;
                public int Pid;
                public int Count;
                public double AvgFps;   // RTSS 自报的平均帧率，仅用于校验
                public int[] FtUs;      // 逐帧帧时间，单位微秒
            }

            /// <summary>
            /// 读取目标进程条目里的逐帧帧时间数组。
            /// 数组是一个约 1000 帧的环形缓冲，写入顺序未知，但 1% Low 是分位数，
            /// 与顺序无关，所以只需要把「像帧时间」的那一段连续值取出来。
            /// 取出来后用「均值换算帧率 ≈ RTSS 自报平均帧率」做校验，防止偏移猜错读到垃圾。
            /// </summary>
            public static FrameHistory ReadHistory(int foregroundPid, int preferredPid)
            {
                FrameHistory result = new FrameHistory();

                IntPtr mapping = IntPtr.Zero;
                IntPtr view = IntPtr.Zero;
                try
                {
                    mapping = OpenFileMapping(FileMapRead, false, RtssMapping);
                    if (mapping == IntPtr.Zero) return result;

                    view = MapViewOfFile(mapping, FileMapRead, 0, 0, UIntPtr.Zero);
                    if (view == IntPtr.Zero) return result;

                    if (Marshal.ReadInt32(view, 0) != RtssSignature) return result;

                    int entrySize = Marshal.ReadInt32(view, 8);
                    int arrOffset = Marshal.ReadInt32(view, 12);
                    int arrCount = Marshal.ReadInt32(view, 16);

                    if (entrySize < HistoryOffset + HistoryMinFrames * 4 || entrySize > 64 * 1024) return result;
                    if (arrOffset <= 0 || arrCount <= 0 || arrCount > 1024) return result;

                    int tick = Environment.TickCount;
                    int bestIndex = -1;
                    int preferredIndex = -1;

                    for (int i = 0; i < arrCount; i++)
                    {
                        int baseOff = arrOffset + i * entrySize;
                        int pid = Marshal.ReadInt32(view, baseOff);
                        if (pid == 0) continue;

                        int t1 = Marshal.ReadInt32(view, baseOff + 272);
                        int frames = Marshal.ReadInt32(view, baseOff + 276);
                        if (frames <= 0 || t1 <= 0) continue;

                        int age = tick - t1;
                        if (age < 0 || age > 1500) continue;

                        if (pid == foregroundPid) bestIndex = i;
                        else if (pid == preferredPid && preferredIndex < 0) preferredIndex = i;
                    }

                    if (bestIndex < 0) bestIndex = preferredIndex;
                    if (bestIndex < 0) return result;

                    int b = arrOffset + bestIndex * entrySize;

                    int begin = Marshal.ReadInt32(view, b + 268);
                    int end = Marshal.ReadInt32(view, b + 272);
                    int framesInWindow = Marshal.ReadInt32(view, b + 276);
                    if (framesInWindow < 2 || end <= begin) return result;

                    double reportedFps = framesInWindow * 1000.0 / (end - begin);
                    if (reportedFps <= 0 || reportedFps > 10000) return result;

                    int slots = (entrySize - HistoryOffset) / 4;
                    if (slots < HistoryMinFrames) return result;

                    // 找出最长的一段连续「像帧时间」的值（环形缓冲未写入的位置是 0）
                    int runStart = -1;
                    int runLen = 0;
                    int bestStart = -1;
                    int bestLen = 0;
                    int[] raw = new int[slots];

                    for (int i = 0; i < slots; i++)
                    {
                        int v = Marshal.ReadInt32(view, b + HistoryOffset + i * 4);
                        raw[i] = v;
                        bool plausible = v >= 50 && v <= 5000000;
                        if (plausible)
                        {
                            if (runStart < 0) runStart = i;
                            runLen++;
                            if (runLen > bestLen)
                            {
                                bestLen = runLen;
                                bestStart = runStart;
                            }
                        }
                        else
                        {
                            runStart = -1;
                            runLen = 0;
                        }
                    }

                    if (bestLen < HistoryMinFrames) return result;

                    double sum = 0;
                    for (int i = bestStart; i < bestStart + bestLen; i++) sum += raw[i];
                    double meanUs = sum / bestLen;
                    if (meanUs <= 0) return result;

                    double impliedFps = 1000000.0 / meanUs;
                    if (impliedFps < reportedFps * 0.6 || impliedFps > reportedFps * 1.6)
                    {
                        // 偏移对不上，说明这个 RTSS 版本的 entry 布局不同
                        return result;
                    }

                    int[] ft = new int[bestLen];
                    Array.Copy(raw, bestStart, ft, 0, bestLen);

                    result.Available = true;
                    result.Pid = Marshal.ReadInt32(view, b);
                    result.Count = bestLen;
                    result.AvgFps = reportedFps;
                    result.FtUs = ft;
                    return result;
                }
                catch
                {
                    return new FrameHistory();
                }
                finally
                {
                    if (view != IntPtr.Zero) UnmapViewOfFile(view);
                    if (mapping != IntPtr.Zero) CloseHandle(mapping);
                }
            }

            /// <summary>
            /// 读取 RTSS 共享内存。优先取前台进程的条目；若前台不是被 RTSS 挂钩的进程
            /// （例如用户点了 HUD 本身、或切到聊天窗口），则沿用上一次仍在出帧的游戏条目，
            /// 这样切出去看一眼再切回来不会把 FPS 与 1% Low 清空。
            /// </summary>
            public static RtssSample Read(int foregroundPid, int preferredPid, bool withName)
            {
                RtssSample result = new RtssSample();
                result.App = "";

                IntPtr mapping = IntPtr.Zero;
                IntPtr view = IntPtr.Zero;
                try
                {
                    mapping = OpenFileMapping(FileMapRead, false, RtssMapping);
                    if (mapping == IntPtr.Zero) return result;

                    view = MapViewOfFile(mapping, FileMapRead, 0, 0, UIntPtr.Zero);
                    if (view == IntPtr.Zero) return result;

                    if (Marshal.ReadInt32(view, 0) != RtssSignature) return result;

                    int entrySize = Marshal.ReadInt32(view, 8);
                    int arrOffset = Marshal.ReadInt32(view, 12);
                    int arrCount = Marshal.ReadInt32(view, 16);

                    if (entrySize < 300 || entrySize > 64 * 1024) return result;
                    if (arrOffset <= 0 || arrCount <= 0 || arrCount > 1024) return result;

                    int tick = Environment.TickCount;
                    int bestIndex = -1;
                    int preferredIndex = -1;

                    for (int i = 0; i < arrCount; i++)
                    {
                        int baseOff = arrOffset + i * entrySize;
                        int pid = Marshal.ReadInt32(view, baseOff);
                        if (pid == 0) continue;

                        int t1 = Marshal.ReadInt32(view, baseOff + 272);
                        int frames = Marshal.ReadInt32(view, baseOff + 276);
                        if (frames <= 0 || t1 <= 0) continue;

                        int age = tick - t1;
                        if (age < 0 || age > 1500) continue; // 条目已停更（游戏退出/最小化）

                        if (pid == foregroundPid) bestIndex = i;
                        else if (pid == preferredPid && preferredIndex < 0) preferredIndex = i;
                    }

                    if (bestIndex < 0) bestIndex = preferredIndex;
                    if (bestIndex < 0) return result;

                    result.Available = true;

                    int b = arrOffset + bestIndex * entrySize;
                    int appPid = Marshal.ReadInt32(view, b);
                    int begin = Marshal.ReadInt32(view, b + 268);
                    int end = Marshal.ReadInt32(view, b + 272);
                    int count = Marshal.ReadInt32(view, b + 276);

                    if (count > 1 && end > begin)
                    {
                        double elapsed = end - begin;
                        double fps = count * 1000.0 / elapsed;
                        if (fps > 0 && fps <= 100000)
                        {
                            result.Fps = fps;
                            result.FrametimeMs = 1000.0 / fps;
                        }
                    }

                    result.Pid = appPid;
                    result.Frames = count;
                    result.EndTime = end;
                    if (!withName) return result;

                    result.App = ProcessNameOf(appPid);
                    if (string.IsNullOrEmpty(result.App))
                    {
                        try
                        {
                            string rawName = ReadAnsi(view, b + 4, 260);
                            result.App = Path.GetFileName(rawName);
                        }
                        catch { }
                    }
                    return result;
                }
                catch
                {
                    return result;
                }
                finally
                {
                    if (view != IntPtr.Zero) UnmapViewOfFile(view);
                    if (mapping != IntPtr.Zero) CloseHandle(mapping);
                }
            }

            private static string ProcessNameOf(int pid)
            {
                try
                {
                    Process pr = Process.GetProcessById(pid);
                    return pr.ProcessName + ".exe";
                }
                catch
                {
                    return "";
                }
            }

            private static string ReadAnsi(IntPtr p, int offset, int max)
            {
                var sb = new StringBuilder();
                for (int i = 0; i < max; i++)
                {
                    byte b = Marshal.ReadByte(p, offset + i);
                    if (b == 0) break;
                    sb.Append((char)b);
                }
                return sb.ToString();
            }
        }
    }
}
