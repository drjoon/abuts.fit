using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritCommands;

[ComImport]
[CompilerGenerated]
[DefaultMember("AddCommand")]
[Guid("F117077A-2C8D-450F-92B2-CD1A0D382609")]
[TypeIdentifier]
public interface IAddIn
{
	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(0)]
	int AddCommand([In] int Cookie, [In] int UserId, [In][MarshalAs(UnmanagedType.BStr)] string UserName);

	void _VtblGap1_1();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(2)]
	int GetCookie();
}
