// change-log:
// - 2026-09-13: StoreProductPrice 오버라이드 캐시 로드/저장.
// related files:
// - web/backend/models/storeProductPrice.model.js
// - web/backend/constants/storeCatalog.js
import StoreProductPrice from "../models/storeProductPrice.model.js";
import {
  listStoreProductIds,
  setStorePriceOverrides,
  STORE_PRODUCT_INCLUSIVE_PRICES,
  STORE_PRODUCT_PACKAGE_INCLUSIVE_PRICES,
} from "../constants/storeCatalog.js";

export async function refreshStorePriceOverrideCache() {
  const rows = await StoreProductPrice.find({})
    .select({
      productId: 1,
      listPriceInclusive: 1,
      packagePriceInclusive: 1,
    })
    .lean();
  const map = Object.create(null);
  for (const row of rows) {
    const id = String(row.productId || "").trim();
    if (!id) continue;
    map[id] = {
      listPriceInclusive:
        row.listPriceInclusive == null
          ? null
          : Math.round(Number(row.listPriceInclusive)),
      packagePriceInclusive:
        row.packagePriceInclusive == null
          ? null
          : Math.round(Number(row.packagePriceInclusive)),
    };
  }
  setStorePriceOverrides(map);
  return map;
}

/**
 * @param {{
 *   productId: string,
 *   listPriceInclusive?: number|null,
 *   packagePriceInclusive?: number|null,
 *   clearList?: boolean,
 *   clearPackage?: boolean,
 * }} args
 */
export async function upsertStoreProductPrice(args) {
  const productId = String(args.productId || "").trim();
  if (!listStoreProductIds().includes(productId)) {
    const err = new Error("unknown_product");
    err.statusCode = 404;
    throw err;
  }

  const $set = {};
  const $unset = {};

  if (args.clearList) {
    $unset.listPriceInclusive = 1;
  } else if (args.listPriceInclusive !== undefined) {
    const n = Math.round(Number(args.listPriceInclusive));
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error("invalid_list_price");
      err.statusCode = 400;
      throw err;
    }
    $set.listPriceInclusive = n;
  }

  if (args.clearPackage) {
    $unset.packagePriceInclusive = 1;
  } else if (args.packagePriceInclusive !== undefined) {
    if (
      args.packagePriceInclusive === null ||
      args.packagePriceInclusive === ""
    ) {
      $unset.packagePriceInclusive = 1;
    } else {
      const n = Math.round(Number(args.packagePriceInclusive));
      if (!Number.isFinite(n) || n < 0) {
        const err = new Error("invalid_package_price");
        err.statusCode = 400;
        throw err;
      }
      $set.packagePriceInclusive = n;
    }
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    const err = new Error("no_price_fields");
    err.statusCode = 400;
    throw err;
  }

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;

  const doc = await StoreProductPrice.findOneAndUpdate(
    { productId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  await refreshStorePriceOverrideCache();
  return doc;
}

export function getCatalogDefaultPrices(productId) {
  const key = String(productId || "").trim();
  return {
    listPriceInclusive: STORE_PRODUCT_INCLUSIVE_PRICES[key] ?? null,
    packagePriceInclusive: STORE_PRODUCT_PACKAGE_INCLUSIVE_PRICES[key] ?? null,
  };
}
