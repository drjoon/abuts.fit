using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritCommands;

[ComImport]
[CompilerGenerated]
[ComEventInterface(typeof(_IAddInEvents), typeof(_IAddInEvents))]
[TypeIdentifier("a300048b-1b1f-4e73-879b-94d6a4e82171", "EspritCommands._IAddInEvents_Event")]
public interface _IAddInEvents_Event
{
	event _IAddInEvents_OnCommandEventHandler OnCommand;
}
