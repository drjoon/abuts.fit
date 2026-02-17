import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { CncEventLogModal } from "@/components/CncEventLogModal";
import { CncProgramEditorPanel } from "@/pages/manufacturer/cnc/components/CncProgramEditorPanel";
import { CncPlaylistDrawer } from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";
import { CompletedMachiningRecordsModal } from "@/pages/manufacturer/cnc/components/CompletedMachiningRecordsModal";
import { MachineQueueCard } from "./components/MachineQueueCard";
import type { MachineStatus } from "./types";
import { useMachiningBoard } from "./hooks/useMachiningBoard";

export const MachiningQueueBoard = ({
  searchQuery,
}: {
  searchQuery?: string;
}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const board = useMachiningBoard({ token });

  const filteredMachines = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();
    const list = Array.isArray(board.mergedMachines)
      ? board.mergedMachines
      : [];
    if (!q) return list;
    return list.filter((m: any) => {
      const fields = [m.name, m.uid, m.ip].filter(Boolean);
      return fields.some((f) => String(f).toLowerCase().indexOf(q) >= 0);
    });
  }, [board.mergedMachines, searchQuery]);

  const requestToggleMachineAuto = useCallback(
    (uid: string, next: boolean) => {
      if (!next) {
        void board.updateMachineAuto(uid, false);
        return;
      }

      const t = (Array.isArray(board.machines) ? board.machines : []).find(
        (m: any) => m.uid === uid,
      );
      const name = t?.name || uid;

      toast({
        title: "자동 가공을 켤까요?",
        description:
          "ON 하면 대기 중인 의뢰의 자동 가공이 즉시 시작될 수 있습니다. 계속 진행하시겠습니까?",
        variant: "destructive",
        duration: 8000,
        action: (
          <ToastAction
            altText="자동 가공 ON"
            onClick={() => {
              void board.updateMachineAuto(uid, true);
            }}
          >
            {name} ON
          </ToastAction>
        ),
      });
    },
    [board, toast],
  );

  return (
    <div
      className="space-y-4"
      onMouseDownCapture={board.handleBoardClickCapture}
      onTouchStartCapture={board.handleBoardClickCapture}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {board.isMockFromBackend != null ? (
            <Badge
              variant="outline"
              className={`shrink-0 text-[11px] font-extrabold px-2.5 py-1 border ${
                board.isMockFromBackend === true
                  ? "bg-violet-50 text-violet-700 border-violet-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
              title={
                board.isMockFromBackend === true
                  ? "더미(모의) 가공"
                  : "실제 가공"
              }
            >
              {board.isMockFromBackend === true ? "MOCK" : "REAL"}
            </Badge>
          ) : null}

          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-200 truncate">
            {board.statusRefreshing
              ? "장비 상태 조회중…"
              : board.statusRefreshError
                ? `장비 상태 조회 실패${
                    board.statusRefreshErroredAt
                      ? ` ${board.statusRefreshErroredAt}`
                      : ""
                  } (${board.statusRefreshError})`
                : board.statusRefreshedAt
                  ? `장비 상태 갱신 ${board.statusRefreshedAt}`
                  : ""}
          </div>
        </div>
        <div
          className="app-surface app-surface--panel flex items-center gap-3 px-4 py-3"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          <div className="text-[12px] font-extrabold text-slate-700">
            전체 자동 가공 허용
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              board.globalAutoEnabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
            onClick={() => {
              void board.setGlobalAutoEnabled(!board.globalAutoEnabled);
            }}
            disabled={board.loading}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                board.globalAutoEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {filteredMachines.map((m) => {
          const statusFromStore = board.statusByUid?.[m.uid];
          const local = board.machineStatusMap?.[m.uid] ?? null;
          const mergedStatus: MachineStatus | null = local
            ? {
                ...local,
                status: String(
                  statusFromStore != null ? statusFromStore : local.status,
                ).trim(),
              }
            : statusFromStore != null
              ? {
                  uid: m.uid,
                  status: String(statusFromStore).trim(),
                }
              : null;

          return (
            <MachineQueueCard
              key={m.uid}
              machineId={m.uid}
              machineName={m.name}
              machine={m}
              queue={
                Array.isArray(board.queueMap?.[m.uid])
                  ? board.queueMap[m.uid]
                  : []
              }
              machiningElapsedSeconds={
                typeof board.machiningElapsedSecondsMap?.[m.uid] === "number"
                  ? board.machiningElapsedSecondsMap[m.uid]
                  : null
              }
              lastCompleted={board.lastCompletedMap?.[m.uid] || null}
              nowPlayingHint={board.nowPlayingHintMap?.[m.uid] || null}
              onOpenRequestLog={(requestId) =>
                board.setEventLogRequestId(requestId)
              }
              autoEnabled={m.allowAutoMachining === true}
              onToggleAuto={(next) => {
                requestToggleMachineAuto(m.uid, next);
              }}
              onToggleRequestAssign={(next) => {
                void board.updateMachineRequestAssign(m.uid, next);
              }}
              machineStatus={mergedStatus}
              statusRefreshing={board.statusRefreshing}
              onOpenReservation={() => board.openReservationForMachine(m.uid)}
              onOpenProgramCode={(prog, machineId) => {
                void board.openProgramDetailForMachining(prog, machineId);
              }}
              onOpenCompleted={(mid, name) => {
                board.setCompletedModalMachineId(String(mid || "").trim());
                board.setCompletedModalTitle(
                  `${String(name || mid || "").trim()} 가공 완료`,
                );
                board.setCompletedModalOpen(true);
              }}
            />
          );
        })}
      </div>

      <CompletedMachiningRecordsModal
        open={board.completedModalOpen}
        onOpenChange={board.setCompletedModalOpen}
        machineId={board.completedModalMachineId}
        title={board.completedModalTitle}
        pageSize={5}
      />

      {board.eventLogRequestId ? (
        <CncEventLogModal
          open={!!board.eventLogRequestId}
          mode={{ kind: "request", requestId: board.eventLogRequestId }}
          onOpenChange={(next) => {
            if (!next) board.setEventLogRequestId(null);
          }}
        />
      ) : null}

      <CncPlaylistDrawer
        open={board.playlistOpen}
        title={board.playlistTitle}
        jobs={board.playlistJobs}
        readOnly={false}
        deleteVariant="worksheet"
        onClose={() => {
          board.setPlaylistOpen(false);
        }}
        onOpenCode={(jobId) => {
          const mid = String(board.playlistMachineId || "").trim();
          if (!mid) return;
          const job = (
            Array.isArray(board.playlistJobs) ? board.playlistJobs : []
          ).find((j) => j.id === jobId);
          if (!job) return;
          // workUid는 openProgramDetailForMachining 내에서 설정됨
          const prog: any = {
            programNo: job.programNo ?? null,
            no: job.programNo ?? null,
            name: job.name,
            source: job.source || "db",
            s3Key: job.s3Key || "",
            s3Bucket: job.s3Bucket || "",
            bridgePath: job.bridgePath || "",
            requestId: job.requestId || "",
            headType: 1,
          };
          void board.openProgramDetailForMachining(prog, mid);
        }}
        onDelete={(jobId) => {
          void (async () => {
            try {
              if (!board.token) return;
              const mid = String(board.playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${board.token}`,
                  },
                  body: JSON.stringify({ deleteRequestIds: [jobId] }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "CAM으로 되돌리기 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${board.token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                board.setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                board.setPlaylistJobs(
                  board.buildPlaylistJobsFromQueue(rawNext),
                );
                await board.loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await board.loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "CAM으로 되돌리기 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onReorder={(nextOrder) => {
          void (async () => {
            try {
              if (!board.token) return;
              const mid = String(board.playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${board.token}`,
                  },
                  body: JSON.stringify({ order: nextOrder }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "순서 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${board.token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                board.setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                board.setPlaylistJobs(
                  board.buildPlaylistJobsFromQueue(rawNext),
                );
                await board.loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await board.loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "순서 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onChangeQty={(jobId, qty) => {
          void (async () => {
            try {
              if (!board.token) return;
              const mid = String(board.playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${board.token}`,
                  },
                  body: JSON.stringify({
                    qtyUpdates: [{ requestId: jobId, qty }],
                  }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "수량 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${board.token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                board.setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                board.setPlaylistJobs(
                  board.buildPlaylistJobsFromQueue(rawNext),
                );
                await board.loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await board.loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "수량 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
      />

      {board.programEditorOpen && board.programEditorTarget ? (
        <CncProgramEditorPanel
          open={board.programEditorOpen}
          onClose={board.closeProgramEditor}
          workUid={board.workUid}
          selectedProgram={board.programEditorTarget}
          onLoadProgram={board.loadProgramCodeForMachining}
          onSaveProgram={board.saveProgramCode}
          readOnly={board.isReadOnly}
        />
      ) : null}
    </div>
  );
};

export default MachiningQueueBoard;
