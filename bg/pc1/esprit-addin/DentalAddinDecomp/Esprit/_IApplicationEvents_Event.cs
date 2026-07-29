// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[ComEventInterface(typeof(_IApplicationEvents), typeof(_IApplicationEvents))]
[TypeIdentifier("bbd2ce70-67ec-11d0-a953-006097130612", "Esprit._IApplicationEvents_Event")]
public interface _IApplicationEvents_Event
{
	void _VtblGap1_6();

	event _IApplicationEvents_AfterDocumentOpenEventHandler AfterDocumentOpen;

	event _IApplicationEvents_AfterNewDocumentOpenEventHandler AfterNewDocumentOpen;

	event _IApplicationEvents_AfterTemplateOpenEventHandler AfterTemplateOpen;
}
