/**
 * 생산 큐 응답용 ncPreload 정규화.
 * NC s3Key가 있는데 GENERATING/UPLOADING에 남으면 NONE으로 치유한다.
 */
export function resolveQueueNcPreload(reqItem, healIds) {
  const preload = reqItem?.productionSchedule?.ncPreload || null;
  if (!preload || typeof preload !== "object") return null;
  const status = String(preload.status || "")
    .trim()
    .toUpperCase();
  const hasNc = Boolean(String(reqItem?.caseInfos?.ncFile?.s3Key || "").trim());
  const stuckGenerating =
    hasNc && (status === "GENERATING" || status === "UPLOADING");
  if (stuckGenerating) {
    const id = String(reqItem?._id || "").trim();
    if (id && Array.isArray(healIds)) healIds.push(id);
    return {
      status: "NONE",
      machineId: preload.machineId,
      updatedAt: new Date(),
      error: null,
    };
  }
  return {
    status: preload.status,
    machineId: preload.machineId,
    updatedAt: preload.updatedAt,
    error: preload.error,
  };
}
