import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { ManufacturerRequest } from "../../utils/request";

type MailboxContentsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  requests: ManufacturerRequest[];
  onRollback?: (req: ManufacturerRequest) => void;
};

export const MailboxContentsModal = ({
  open,
  onOpenChange,
  address,
  requests,
  onRollback,
}: MailboxContentsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            우편함 {address} - {requests.length}건
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req._id}
              className="flex items-start justify-between p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-900">
                  {req.requestId}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {req.requestor?.organization && (
                    <div>의뢰처: {req.requestor.organization}</div>
                  )}
                  {req.caseInfos?.patientName && (
                    <div>환자: {req.caseInfos.patientName}</div>
                  )}
                  {req.caseInfos?.tooth && (
                    <div>치아: {req.caseInfos.tooth}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 ml-4">
                <Badge variant="outline" className="text-xs">
                  {req.manufacturerStage || "의뢰"}
                </Badge>
                {req.mailboxAddress && (
                  <div className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    {req.mailboxAddress}
                  </div>
                )}
                {onRollback && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      onRollback(req);
                      onOpenChange(false);
                    }}
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
