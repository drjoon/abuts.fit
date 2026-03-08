import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type { ManufacturerRequest } from "../../utils/request";

type MailboxContentsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  requests: ManufacturerRequest[];
  onRollback?: (req: ManufacturerRequest) => void;
  onRollbackAll?: (requests: ManufacturerRequest[]) => void;
  isRollingBackAll?: boolean;
};

export const MailboxContentsModal = ({
  open,
  onOpenChange,
  address,
  requests,
  onRollback,
  onRollbackAll,
  isRollingBackAll = false,
}: MailboxContentsModalProps) => {
  const getLotShortCode = (req: ManufacturerRequest) => {
    const full = String(
      req.lotNumber?.final ||
        req.lotNumber?.part ||
        req.lotNumber?.material ||
        "",
    ).trim();
    const match = full.match(/[A-Z]{3}$/i);
    return match ? match[0].toUpperCase() : "";
  };

  const primaryOrganization =
    requests.find((req) => req.requestor?.organization)?.requestor
      ?.organization || "-";

  const stageLabel =
    requests.find((req) => req.manufacturerStage)?.manufacturerStage || "의뢰";

  const getImplantInfo = (req: ManufacturerRequest) => {
    const parts = [
      String(req.caseInfos?.implantManufacturer || "").trim(),
      String(req.caseInfos?.implantBrand || "").trim(),
      String(req.caseInfos?.implantFamily || "").trim(),
      String(req.caseInfos?.implantType || "").trim(),
    ].filter(Boolean);
    return parts.join(" / ");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base text-slate-800">
            <span className="text-lg font-semibold text-slate-900">
              {address}
            </span>
            {primaryOrganization && primaryOrganization !== "-" ? (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-sm text-slate-600">
                  {primaryOrganization}
                </span>
              </>
            ) : null}
            <span className="ml-auto flex items-center gap-2 mr-6">
              <Badge
                variant="secondary"
                className="text-[11px] bg-slate-100 text-slate-700"
              >
                {stageLabel}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {requests.length}건
              </Badge>
              {onRollbackAll ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={isRollingBackAll}
                  onClick={() => onRollbackAll(requests)}
                >
                  <ArrowLeft className="h-3 w-3" />
                </Button>
              ) : null}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {requests.map((req) => (
            <div
              key={req._id}
              className="relative p-4 border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors flex flex-col gap-3"
            >
              <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                {onRollback && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={isRollingBackAll}
                    onClick={() => {
                      void onRollback(req);
                    }}
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                )}
                {getLotShortCode(req) && (
                  <Badge className="text-[11px] bg-slate-900 text-white border border-slate-900">
                    {getLotShortCode(req)}
                  </Badge>
                )}
              </div>
              <div className="flex items-start gap-3 pr-10">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900">
                    {req.requestId}
                  </div>
                  <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                    <div>
                      {req.caseInfos?.clinicName || "-"} /{" "}
                      {req.caseInfos?.patientName || "미지정"} /{" "}
                      {req.caseInfos?.tooth || "-"}
                    </div>
                    {getLotShortCode(req) && (
                      <div>LOT: {getLotShortCode(req)}</div>
                    )}
                    {getImplantInfo(req) && <div>{getImplantInfo(req)}</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
