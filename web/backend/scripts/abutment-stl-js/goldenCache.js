import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const GOLDEN_CACHE_DIR =
  process.env.ABUTMENT_STL_GOLDEN_DIR ||
  path.resolve(here, "../../.cache/abutment-stl-golden");

export const REPORT_DIR =
  process.env.ABUTMENT_STL_REPORT_DIR ||
  path.resolve(here, "../../.cache/abutment-stl-reports");
