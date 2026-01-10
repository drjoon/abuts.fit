import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
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

type DiameterGroup = "6" | "8" | "10" | "10+";

export type CncMaterialInfo = {
  materialType?: string;
  heatNo?: string;
  diameter: number;
  diameterGroup: DiameterGroup;
  remainingLength?: number;
};

type Mode = "view" | "replace" | "add";

interface CncMaterialModalProps {
  open: boolean;
  onClose: () => void;
  machineId: string;
  machineName: string;
  currentMaterial?: CncMaterialInfo | null;
  onReplace: (next: {
    materialType: string;
    heatNo: string;
    diameter: number;
    diameterGroup: DiameterGroup;
    remainingLength: number;
  }) => Promise<void>;
  onAdd: (next: { remainingLength: number }) => Promise<void>;
}

const toDiameterGroup = (d: number): DiameterGroup => {
  if (d <= 6) return "6";
  if (d <= 8) return "8";
  if (d <= 10) return "10";
  return "10+";
};

export const CncMaterialModal = ({
  open,
  onClose,
  machineId,
  machineName,
  currentMaterial,
  onReplace,
  onAdd,
}: CncMaterialModalProps) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("view");
  const base = useMemo(() => {
    const d = Number(currentMaterial?.diameter || 8);
    const g = (currentMaterial?.diameterGroup ||
      toDiameterGroup(d)) as DiameterGroup;
    return {
      materialType: String(currentMaterial?.materialType || "Ti. Alloy"),
      heatNo: String(currentMaterial?.heatNo || ""),
      diameter: d,
      diameterGroup: g,
      remainingLength: Number(currentMaterial?.remainingLength || 0),
    };
  }, [currentMaterial]);

  const [materialType, setMaterialType] = useState(base.materialType);
  const [heatNo, setHeatNo] = useState(base.heatNo);
  const [diameterGroup, setDiameterGroup] = useState<DiameterGroup>(
    base.diameterGroup
  );
  const [diameter, setDiameter] = useState<number>(base.diameter);
  const [remainingLength, setRemainingLength] = useState<number>(
    base.remainingLength
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("view");
    setMaterialType(base.materialType);
    setHeatNo(base.heatNo);
    setDiameterGroup(base.diameterGroup);
    setDiameter(base.diameter);
    setRemainingLength(base.remainingLength);
  }, [open, base]);

  useEffect(() => {
    if (diameterGroup === "6") setDiameter(6);
    else if (diameterGroup === "8") setDiameter(8);
    else if (diameterGroup === "10") setDiameter(10);
    else {
      setDiameter((prev) => (prev && prev > 10 ? prev : 12));
    }
  }, [diameterGroup]);

  const title: ReactNode =
    mode === "replace"
      ? `소재교체 - ${machineName}`
      : mode === "add"
      ? `소재추가 - ${machineName}`
      : `원소재 - ${machineName}`;

  const handleReplace = async () => {
    try {
      setLoading(true);
      await onReplace({
        materialType: String(materialType || "").trim(),
        heatNo: String(heatNo || "").trim(),
        diameter,
        diameterGroup,
        remainingLength,
      });
      toast({ title: "소재교체", description: "소재 정보를 변경했습니다." });
      onClose();
    } catch (e: any) {
      toast({
        title: "실패",
        description: e?.message || "소재교체에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      setLoading(true);
      await onAdd({ remainingLength });
      toast({ title: "소재추가", description: "잔여량을 업데이트했습니다." });
      onClose();
    } catch (e: any) {
      toast({
        title: "실패",
        description: e?.message || "소재추가에 실패했습니다.",
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">현재 소재</p>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>소재: {base.materialType || "-"}</p>
              <p>Heat No.: {base.heatNo || "-"}</p>
              <p>
                직경: {base.diameter}mm ({base.diameterGroup})
              </p>
              <p>잔여량: {base.remainingLength}</p>
            </div>
          </div>

          {mode === "replace" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>소재 종류</Label>
                <Input
                  value={materialType}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setMaterialType(e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Heat No.</Label>
                <Input
                  value={heatNo}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setHeatNo(e.target.value)
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>직경 그룹</Label>
                  <Select
                    value={diameterGroup}
                    onValueChange={(v: string) =>
                      setDiameterGroup(v as DiameterGroup)
                    }
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
                <div className="space-y-1.5">
                  <Label>직경(mm)</Label>
                  <Input
                    type="number"
                    value={isFinite(diameter) ? diameter : 0}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const n = Number(e.target.value);
                      setDiameter(isFinite(n) ? n : 0);
                    }}
                    disabled={diameterGroup !== "10+"}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>잔여량</Label>
                <Input
                  type="number"
                  value={isFinite(remainingLength) ? remainingLength : 0}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const n = Number(e.target.value);
                    setRemainingLength(isFinite(n) ? n : 0);
                  }}
                />
              </div>
            </div>
          )}

          {mode === "add" && (
            <div className="space-y-1.5">
              <Label>추가 후 잔여량</Label>
              <Input
                type="number"
                value={isFinite(remainingLength) ? remainingLength : 0}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const n = Number(e.target.value);
                  setRemainingLength(isFinite(n) ? n : 0);
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {mode === "view" ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                닫기
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode("add")}
                disabled={loading || !machineId}
              >
                소재추가
              </Button>
              <Button
                onClick={() => setMode("replace")}
                disabled={loading || !machineId}
              >
                소재교체
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setMode("view");
                  setMaterialType(base.materialType);
                  setHeatNo(base.heatNo);
                  setDiameterGroup(base.diameterGroup);
                  setDiameter(base.diameter);
                  setRemainingLength(base.remainingLength);
                }}
                disabled={loading}
              >
                뒤로
              </Button>
              <Button
                onClick={mode === "replace" ? handleReplace : handleAdd}
                disabled={loading || !machineId}
              >
                {loading ? "저장 중..." : "저장"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
