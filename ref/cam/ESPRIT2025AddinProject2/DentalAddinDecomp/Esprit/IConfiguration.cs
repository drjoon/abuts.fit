using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("51E3AF7E-C263-4C68-8934-C002281B1013")]
[TypeIdentifier]
public interface IConfiguration
{
	void _VtblGap1_71();

	[DispId(64)]
	double GapTolerance
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(64)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(64)]
		[param: In]
		set;
	}

	void _VtblGap2_30();

	[DispId(84)]
	ConfigurationFeatureRecognition ConfigurationFeatureRecognition
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(84)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}
}
