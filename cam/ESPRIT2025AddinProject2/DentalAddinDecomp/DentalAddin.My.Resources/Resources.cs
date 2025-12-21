using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.Resources;
using System.Runtime.CompilerServices;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin.My.Resources;

[StandardModule]
[GeneratedCode("System.Resources.Tools.StronglyTypedResourceBuilder", "17.0.0.0")]
[DebuggerNonUserCode]
[CompilerGenerated]
[HideModuleName]
internal sealed class Resources
{
	private static ResourceManager resourceMan;

	private static CultureInfo resourceCulture;

	[EditorBrowsable(EditorBrowsableState.Advanced)]
	internal static ResourceManager ResourceManager
	{
		get
		{
			if (object.ReferenceEquals(resourceMan, null))
			{
				resourceMan = new ResourceManager("DentalAddin.Resources", typeof(Resources).Assembly);
			}
			return resourceMan;
		}
	}

	[EditorBrowsable(EditorBrowsableState.Advanced)]
	internal static CultureInfo Culture
	{
		get
		{
			return resourceCulture;
		}
		set
		{
			resourceCulture = value;
		}
	}

	internal static Bitmap cancel => (Bitmap)RuntimeHelpers.GetObjectValue(ResourceManager.GetObject("cancel", resourceCulture));

	internal static Icon Dental => (Icon)RuntimeHelpers.GetObjectValue(ResourceManager.GetObject("Dental", resourceCulture));

	internal static Bitmap ok => (Bitmap)RuntimeHelpers.GetObjectValue(ResourceManager.GetObject("ok", resourceCulture));

	internal static Bitmap ok0 => (Bitmap)RuntimeHelpers.GetObjectValue(ResourceManager.GetObject("ok0", resourceCulture));
}
