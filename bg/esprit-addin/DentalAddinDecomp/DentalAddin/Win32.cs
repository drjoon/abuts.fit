using System.Runtime.InteropServices;

namespace DentalAddin
{
    internal class Win32
    {
        [DllImport("user32.dll")]
        internal static extern int SetParent(int hWndChild, int hWndNewParent);

        [DllImport("user32.dll")]
        internal static extern int GetClientRect(int hwnd, ref RECT ipRect);

        [DllImport("user32.dll")]
        internal static extern int MoveWindow(int hwnd, int x, int y, int nWidth, int nHeight, int bRepaint);

        [DllImport("user32.dll")]
        internal static extern int GetParent(int hwnd);
    }
}
