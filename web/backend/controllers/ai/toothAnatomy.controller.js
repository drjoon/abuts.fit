// FDI 치아별 부위별 정상 크기·해부 형태 조회 컨트롤러.
// DB에 아직 시드가 없으면 최초 조회 시 32개 영구치 기준표를 자동 구축하고 메모리 캐시로 응답한다.
// related files:
// - web/backend/models/toothAnatomy.model.js
// - web/backend/services/toothAnatomy.seed.js
// - web/backend/modules/ai/ai.routes.js
import {
  buildAllFdiToothAnatomyDocs,
  ensureToothAnatomySeeded,
} from "../../services/toothAnatomy.seed.js";

let cachedCatalog = null;
let inflightSeedPromise = null;

export async function getToothAnatomyCatalog(_req, res) {
  try {
    if (!cachedCatalog) {
      if (!inflightSeedPromise) {
        inflightSeedPromise = ensureToothAnatomySeeded()
          .then((rows) => {
            cachedCatalog = rows;
            return rows;
          })
          .finally(() => {
            inflightSeedPromise = null;
          });
      }
      await inflightSeedPromise;
    }
    return res.status(200).json({
      success: true,
      data: {
        teeth: cachedCatalog || buildAllFdiToothAnatomyDocs(),
      },
    });
  } catch (error) {
    console.warn("[tooth-anatomy] fallback to static seed", error?.message || error);
    return res.status(200).json({
      success: true,
      data: {
        teeth: buildAllFdiToothAnatomyDocs(),
      },
    });
  }
}

export function clearToothAnatomyCatalogCache() {
  cachedCatalog = null;
}
