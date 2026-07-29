// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritCommands;

[ComImport]
[CompilerGenerated]
[Guid("4E2B5196-2A91-46E4-BF0B-57D8EA270819")]
[InterfaceType(2)]
[TypeIdentifier]
public interface _IAddInEvents
{
	[MethodImpl(MethodImplOptions.PreserveSig | MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(1)]
	void OnCommand([In] int Cookie, [In] int UserId);
}
