import ctypes, ctypes.wintypes as w

u32 = ctypes.WinDLL('user32')
k32 = ctypes.WinDLL('kernel32')
dwm = ctypes.WinDLL('dwmapi')

u32.FindWindowW.restype = w.HWND
u32.FindWindowW.argtypes = [w.LPCWSTR, w.LPCWSTR]
u32.SetWindowRgn.restype = w.INT
u32.SetWindowRgn.argtypes = [w.HWND, w.HANDLE, w.BOOL]
u32.EnumWindows.restype = w.BOOL

DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_ROUND = 2

dwm.DwmSetWindowAttribute.argtypes = [w.HWND, w.DWORD, ctypes.c_void_p, w.DWORD]
dwm.DwmSetWindowAttribute.restype = ctypes.HRESULT

def find_hud():
    buf = ctypes.create_unicode_buffer(512)
    result = []
    @ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    def cb(hwnd, _):
        u32.GetWindowTextW(hwnd, buf, 512)
        t = buf.value
        if 'HUD' in t.upper() and '设置' not in t and 'Settings' not in t:
            result.append(hwnd)
            return False
        return True
    u32.EnumWindows(cb, 0)
    return result[0] if result else None

def apply(hwnd):
    u32.SetWindowRgn(hwnd, None, True)
    val = w.DWORD(DWMWCP_ROUND)
    hr = dwm.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ctypes.byref(val), ctypes.sizeof(val))
    u32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0020)
    return hr

if __name__ == '__main__':
    h = find_hud()
    if h:
        hr = apply(h)
        print('OK' if hr == 0 else f'hr={hr:#010x}')
    else:
        print('NOT_FOUND')
