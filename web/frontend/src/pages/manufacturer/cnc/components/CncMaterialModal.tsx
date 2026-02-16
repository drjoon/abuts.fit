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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DiameterGroup = "6" | "8" | "10" | "10+";

const diameterRank: Record<DiameterGroup, number> = {
  "6": 6,
  "8": 8,
  "10": 10,
  "10+": 999,
};

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
  maxModelDiameterGroups?: DiameterGroup[];
  onReplace: (next: {
    materialType: string;
    heatNo: string;
    diameter: number;
    diameterGroup: DiameterGroup;
    remainingLength: number;
    maxModelDiameterGroups: DiameterGroup[];
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
  maxModelDiameterGroups,
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
    base.diameterGroup,
  );
  const [maxDiaGroups, setMaxDiaGroups] = useState<DiameterGroup[]>(
    Array.isArray(maxModelDiameterGroups) && maxModelDiameterGroups.length > 0
      ? (maxModelDiameterGroups as DiameterGroup[])
      : ([base.diameterGroup] as DiameterGroup[]),
  );
  const [remainingInput, setRemainingInput] = useState<string>(
    String(base.remainingLength || ""),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("replace");
    setMaterialType(base.materialType);
    setHeatNo(base.heatNo);
    setDiameterGroup(base.diameterGroup);
    const allowedMaxRank = diameterRank[base.diameterGroup] ?? 0;
    const incoming =
      Array.isArray(maxModelDiameterGroups) && maxModelDiameterGroups.length > 0
        ? (maxModelDiameterGroups as DiameterGroup[])
        : ([base.diameterGroup] as DiameterGroup[]);
    const filtered = incoming.filter(
      (g) => (diameterRank[g] ?? 0) <= allowedMaxRank,
    );
    const ensured = Array.from(
      new Set([base.diameterGroup, ...(filtered as DiameterGroup[])]),
    ) as DiameterGroup[];
    setMaxDiaGroups(ensured.length > 0 ? ensured : [base.diameterGroup]);
    setRemainingInput(String(base.remainingLength || ""));
  }, [open, base, maxModelDiameterGroups]);

  const title: ReactNode =
    mode === "replace"
      ? `원소재 - ${machineName}`
      : mode === "add"
        ? "소재추가"
        : "원소재";

  const parseLengths = () => {
    const rem = remainingInput.trim();
    const remNum = rem === "" ? 0 : Number(rem);
    if (!Number.isFinite(remNum) || remNum < 0) {
      throw new Error("잔여량을 올바른 숫자로 입력해주세요.");
    }

    let diaNum: number;
    if (diameterGroup === "10+") {
      diaNum = 12;
    } else {
      diaNum = Number(diameterGroup);
    }

    return { diaNum, remNum };
  };

  const allowedMaxRank = diameterRank[diameterGroup] ?? 0;
  const maxRank = Math.max(...maxDiaGroups.map((g) => diameterRank[g] ?? 0), 0);
  const effectiveMaxRank = Math.min(maxRank, allowedMaxRank);
  const canCheckMaxDiaGroup = (g: DiameterGroup) =>
    (diameterRank[g] ?? 0) <= allowedMaxRank;

  useEffect(() => {
    // 선택한 소재 직경은 항상 최대직경 목록에 포함되고, 선택 직경을 초과하는 값은 제거
    setMaxDiaGroups((prev) => {
      const clamped = (prev || []).filter(
        (g) => (diameterRank[g] ?? 0) <= allowedMaxRank,
      );
      const ensured = Array.from(new Set([diameterGroup, ...clamped]));
      return ensured as DiameterGroup[];
    });
  }, [allowedMaxRank, diameterGroup]);

  const toggleMaxDiaGroup = (g: DiameterGroup) => {
    if (g === diameterGroup) return;
    if (!canCheckMaxDiaGroup(g)) return;
    setMaxDiaGroups((prev) => {
      const has = prev.includes(g);
      if (has) {
        const next = prev.filter((x) => x !== g);
        return next.length > 0 ? next : ([diameterGroup] as DiameterGroup[]);
      }
      const next = Array.from(new Set([...(prev || []), g]));
      return next.length > 0
        ? (next as DiameterGroup[])
        : ([diameterGroup] as DiameterGroup[]);
    });
  };

  const handleReplace = async () => {
    try {
      const { diaNum, remNum } = parseLengths();
      setLoading(true);
      await onReplace({
        materialType: String(materialType || "").trim(),
        heatNo: String(heatNo || "").trim(),
        diameter: diaNum,
        diameterGroup,
        remainingLength: remNum,
        maxModelDiameterGroups: maxDiaGroups,
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
      const { remNum } = parseLengths();
      setLoading(true);
      await onAdd({ remainingLength: remNum });
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

  const adjustRemaining = (delta: number) => {
    const v = Number(remainingInput || 0);
    const baseValue = Number.isFinite(v) ? v : 0;
    const next = Math.max(0, baseValue + delta);
    setRemainingInput(String(next));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">현재 소재</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <p>소재: {base.materialType || "-"}</p>
              <p>Heat No.: {base.heatNo || "-"}</p>
              <p>
                직경: {base.diameter}mm ({base.diameterGroup})
              </p>
              <p>잔여량: {base.remainingLength}</p>
            </div>
          </div>

          {mode === "replace" && (
            <div className="grid grid-cols-2 gap-3">
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

              <div className="space-y-1.5">
                <Label>소재 직경</Label>
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
                    <SelectItem value="10+">12mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>가공 가능한 최대직경</Label>
                <div className="grid grid-cols-4 gap-2">
                  {(["6", "8", "10", "10+"] as DiameterGroup[]).map((g) => {
                    const isBase = g === diameterGroup;
                    const isChecked = isBase || maxDiaGroups.includes(g);
                    const isDisabled = isBase || !canCheckMaxDiaGroup(g);
                    return (
                      <label
                        key={g}
                        className="flex items-center gap-1.5 rounded-md border bg-white px-2 py-2 text-sm"
                      >
                        <Checkbox
                          disabled={isDisabled}
                          checked={isChecked}
                          onCheckedChange={() => toggleMaxDiaGroup(g)}
                        />
                        <span className="select-none">
                          {g === "10+" ? "12" : g}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>수량</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(-10)}
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(-1)}
                    >
                      -1
                    </Button>
                  </div>
                  <Input
                    type="number"
                    value={remainingInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setRemainingInput(e.target.value)
                    }
                    className="w-24"
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(1)}
                    >
                      +1
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(10)}
                    >
                      +10
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === "add" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>추가 후 잔여량</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(-10)}
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(-1)}
                    >
                      -1
                    </Button>
                  </div>
                  <Input
                    type="number"
                    value={remainingInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setRemainingInput(e.target.value)
                    }
                    className="w-24"
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(1)}
                    >
                      +1
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2"
                      onClick={() => adjustRemaining(10)}
                    >
                      +10
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <>
            <Button variant="outline" onClick={onClose} disabled={loading}>
              닫기
            </Button>
            <Button
              onClick={mode === "replace" ? handleReplace : handleAdd}
              disabled={loading || !machineId}
            >
              {loading ? "저장 중..." : "저장"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
