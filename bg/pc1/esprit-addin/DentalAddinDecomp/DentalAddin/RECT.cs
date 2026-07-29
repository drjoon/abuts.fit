// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleComposite.cs
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - web/backend/controllers/requests/common.review.controller.js
namespace DentalAddin
{
    internal struct RECT
    {
        internal int X1;

        internal int Y1;

        internal int X2;

        internal int Y2;

        internal RECT(int x1 = 0, int y1 = 0, int x2 = 0, int y2 = 0)
        {
            X1 = x1;
            Y1 = y1;
            X2 = x2;
            Y2 = y2;
        }
    }
}
