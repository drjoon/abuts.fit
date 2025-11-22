import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Machine, MachineForm } from "@/features/cnc/types";

export const useCncMachines = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MachineForm>({
    name: "M1", // 표시용 장비 이름
    hiLinkUid: "", // 실제 Hi-Link UID는 사용자가 입력
    ip: "192.168.0.10",
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalMode, setAddModalMode] = useState<"create" | "edit">("create");
  const { toast } = useToast();

  const loadMachinesFromBackend = async () => {
    try {
      const res = await fetch("/api/core/machines");
      if (!res.ok) throw new Error("failed to load machines");
      const body = await res.json();
      const list: any[] = body.data ?? body.machines ?? [];
      setMachines(
        list.map((m) => ({
          name: m.name ?? m.uid, // 표시용 이름 (우선 name, 없으면 uid)
          hiLinkUid: m.hiLinkUid ?? m.uid, // 없으면 기존 uid를 그대로 사용
          serial: m.serial,
          ip: m.ip,
          port: m.port,
          status: m.lastStatus?.status ?? "Unknown",
          lastUpdated: m.lastStatus?.updatedAt
            ? new Date(m.lastStatus.updatedAt).toLocaleTimeString()
            : undefined,
        }))
      );
    } catch (e: any) {
      console.warn("loadMachinesFromBackend error", e?.message ?? e);
    }
  };

  useEffect(() => {
    loadMachinesFromBackend();
  }, []);

  const handleChange = (field: keyof MachineForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditMachine = (m: Machine) => {
    setForm({ name: m.name, hiLinkUid: m.hiLinkUid, ip: m.ip ?? "" });
    setAddModalMode("edit");
    setAddModalOpen(true);
  };

  const handleDeleteMachine = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const target = machines.find(
        (m) => m.name === name || m.hiLinkUid === name
      );
      const key = target?.hiLinkUid ?? name;
      const res = await fetch(`/api/core/machines/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("장비 삭제 실패");
      setMachines((prev) => prev.filter((m) => m.hiLinkUid !== key));
      toast({
        title: "장비 삭제",
        description: `장비 ${name}를 삭제했습니다.`,
      });
    } catch (e: any) {
      setError(e?.message ?? "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMachine = async () => {
    if (!form.name) {
      setError("장비 이름을 입력해 주세요.");
      return;
    }
    if (!form.hiLinkUid) {
      setError("Hi-Link UID를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/core/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, // 표시용 이름
          hiLinkUid: form.hiLinkUid,
          ip: form.ip,
          port: 8193,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || (body && body.success === false)) {
        throw new Error(body?.message || "장비 저장 실패");
      }

      // 항상 백엔드(MongoDB) 기준으로 동기화
      await loadMachinesFromBackend();
      toast({
        title: "장비 저장",
        description: `장비 ${form.name} (Hi-Link UID: ${form.hiLinkUid}) 정보를 저장했습니다.`,
      });
      setAddModalOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  };

  return {
    machines,
    setMachines,
    loading,
    setLoading,
    error,
    setError,
    form,
    setForm,
    addModalOpen,
    setAddModalOpen,
    addModalMode,
    setAddModalMode,
    handleChange,
    handleEditMachine,
    handleDeleteMachine,
    handleAddMachine,
  };
};
