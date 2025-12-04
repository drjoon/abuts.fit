import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Machine, MachineForm } from "@/features/manufacturer/cnc/types";

export const useCncMachines = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MachineForm>({
    uid: "", // Hi-Link UID와 통합된 장비 식별자
    name: "M1", // 표시용 장비 이름
    ip: "192.168.0.10",
    allowJobStart: true,
    allowProgramDelete: false,
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
        list.map((m) => {
          const uid = m.uid as string;
          const name = (m.name as string) ?? uid;
          return {
            uid,
            name,
            serial: m.serial,
            ip: m.ip,
            port: m.port,
            status: m.lastStatus?.status ?? "Unknown",
            lastUpdated: m.lastStatus?.updatedAt
              ? new Date(m.lastStatus.updatedAt).toLocaleTimeString()
              : undefined,
            allowJobStart: m.allowJobStart !== false,
            allowProgramDelete: m.allowProgramDelete === true,
          } as Machine;
        })
      );
    } catch (e: any) {
      console.warn("loadMachinesFromBackend error", e?.message ?? e);
    }
  };

  useEffect(() => {
    loadMachinesFromBackend();
  }, []);

  const handleChange = (field: keyof MachineForm, value: string | boolean) => {
    // 생성 모드일 때만 name과 uid를 동기화하고,
    // 수정 모드(edit)에서는 uid는 그대로 두고 name만 변경한다.
    if (field === "name") {
      const nameValue = String(value);
      setForm((prev) =>
        addModalMode === "create"
          ? { ...prev, name: nameValue, uid: nameValue }
          : { ...prev, name: nameValue }
      );
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleEditMachine = (m: Machine) => {
    setForm({
      uid: m.uid,
      name: m.name,
      ip: m.ip ?? "",
      allowJobStart: m.allowJobStart !== false,
      allowProgramDelete: m.allowProgramDelete === true,
    });
    setAddModalMode("edit");
    setAddModalOpen(true);
  };

  const handleDeleteMachine = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const target = machines.find((m) => m.name === name || m.uid === name);
      const key = target?.uid ?? name;
      const res = await fetch(`/api/core/machines/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("장비 삭제 실패");
      setMachines((prev) => prev.filter((m) => m.uid !== key));
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
    // 장비 이름이 곧 UID로 사용되므로, 이름이 비어 있으면 저장할 수 없다.
    if (!form.name) {
      setError("장비 이름을 입력해 주세요.");
      return;
    }
    const duplicate = machines.find(
      (m) =>
        (m.uid === form.uid || m.name === form.name) &&
        (addModalMode === "create" || m.uid !== form.uid)
    );
    if (duplicate) {
      const msg =
        duplicate.uid === form.uid
          ? `이미 등록된 UID 입니다: ${form.uid}`
          : `이미 등록된 장비 이름입니다: ${form.name}`;
      setError(msg);
      toast({
        title: "장비 중복",
        description: msg,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/core/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: form.uid, // 장비 식별자(Hi-Link UID와 통합)
          name: form.name, // 표시용 이름
          ip: form.ip,
          port: 8193,
          allowJobStart: form.allowJobStart,
          allowProgramDelete: form.allowProgramDelete,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || (body && body.success === false)) {
        throw new Error(body?.message || "장비 저장 실패");
      }

      // 항상 백엔드(MongoDB) 기준으로 동기화
      await loadMachinesFromBackend();
      const hiLink = body?.hiLink;
      if (hiLink && hiLink.success === false) {
        // Hi-Link result 88: 이미 등록된 UID - 에러가 아니라 등록 정보 갱신으로 간주
        if (hiLink.result === 88) {
          toast({
            title: "Hi-Link",
            description: "등록 정보를 갱신했습니다.",
          });
        } else {
          toast({
            title: "Hi-Link 등록 실패",
            description:
              hiLink.result === -16
                ? "CNC 통신 에러입니다. 설비 전원, 통신 케이블, IP/포트 설정과 네트워크 상태를 확인해 주세요. (브리지 설정은 저장되었을 수 있습니다.)"
                : hiLink.message ||
                  `장비 ${form.name} (UID: ${form.uid})는 Hi-Link에 등록되지 않았습니다.`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "장비 저장",
          description: `장비 ${form.name} (UID: ${form.uid}) 정보를 저장했습니다.`,
        });
      }
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
