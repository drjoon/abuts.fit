import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, AlertCircle } from "lucide-react";

interface CncMaterialChangeModalProps {
  open: boolean;
  onClose: () => void;
  machineId: string;
  machineName: string;
  currentDiameter?: number;
  currentDiameterGroup?: string;
  scheduledChange?: {
    targetTime: string;
    newDiameter: number;
    newDiameterGroup: string;
    notes?: string;
  };
  onSchedule: (data: {
    targetTime: Date;
    newDiameter: number;
    newDiameterGroup: string;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => Promise<void>;
}

export const CncMaterialChangeModal = ({
  open,
  onClose,
  machineId,
  machineName,
  currentDiameter,
  currentDiameterGroup,
  scheduledChange,
  onSchedule,
  onCancel,
}: CncMaterialChangeModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [targetDate, setTargetDate] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [newDiameter, setNewDiameter] = useState<number>(10);
  const [newDiameterGroup, setNewDiameterGroup] = useState<string>("10");
  const [notes, setNotes] = useState("");

  const handleSchedule = async () => {
    if (!targetDate || !targetTime) {
      toast({
        title: "입력 오류",
        description: "교체 예정 날짜와 시간을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const targetDateTime = new Date(`${targetDate}T${targetTime}`);

      await onSchedule({
        targetTime: targetDateTime,
        newDiameter,
        newDiameterGroup,
        notes: notes.trim() || undefined,
      });

      toast({
        title: "예약 완료",
        description: `${machineName} 소재 교체가 예약되었습니다.`,
      });

      onClose();
    } catch (error: any) {
      toast({
        title: "예약 실패",
        description: error.message || "소재 교체 예약에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSchedule = async () => {
    try {
      setLoading(true);
      await onCancel();

      toast({
        title: "예약 취소",
        description: "소재 교체 예약이 취소되었습니다.",
      });

      onClose();
    } catch (error: any) {
      toast({
        title: "취소 실패",
        description: error.message || "예약 취소에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            소재 교체 예약 - {machineName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 현재 소재 정보 */}
          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm font-medium mb-1">현재 소재</p>
            <p className="text-sm text-muted-foreground">
              직경: {currentDiameter}mm ({currentDiameterGroup})
            </p>
          </div>

          {/* 예약된 교체 정보 */}
          {scheduledChange && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    예약된 교체
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    {new Date(scheduledChange.targetTime).toLocaleString(
                      "ko-KR"
                    )}
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    새 소재: {scheduledChange.newDiameter}mm (
                    {scheduledChange.newDiameterGroup})
                  </p>
                  {scheduledChange.notes && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      메모: {scheduledChange.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 새 예약 폼 */}
          {!scheduledChange && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetDate">교체 날짜</Label>
                  <Input
                    id="targetDate"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetTime">교체 시간</Label>
                  <Input
                    id="targetTime"
                    type="time"
                    value={targetTime}
                    onChange={(e) => setTargetTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newDiameterGroup">새 소재 직경</Label>
                <Select
                  value={newDiameterGroup}
                  onValueChange={(value) => {
                    setNewDiameterGroup(value);
                    if (value === "6") setNewDiameter(6);
                    else if (value === "8") setNewDiameter(8);
                    else if (value === "10") setNewDiameter(10);
                    else setNewDiameter(12);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6mm</SelectItem>
                    <SelectItem value="8">8mm</SelectItem>
                    <SelectItem value="10">10mm</SelectItem>
                    <SelectItem value="10+">10mm+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">메모 (선택)</Label>
                <Textarea
                  id="notes"
                  placeholder="교체 관련 메모를 입력하세요..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {scheduledChange ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                닫기
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSchedule}
                disabled={loading}
              >
                예약 취소
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                취소
              </Button>
              <Button onClick={handleSchedule} disabled={loading}>
                {loading ? "예약 중..." : "예약하기"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
