// 등록된 스캔바디 라이브러리를 제조사·임플란트 브랜드·연결로 묶고, 규격 코드는 접미사로만 보인다.
// 분해 규칙과 제조사 별칭은 서버 `scanbodyLibraryIdentity.js`와 같게 유지한다.
// related files:
// - web/frontend/src/pages/admin/dashboard/ScanbodyDemandCard.tsx
// - web/frontend/src/shared/components/practice/ScanbodyLibraryManager.tsx
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts

// 연결 코드는 숫자로 시작할 수 있다(지오메디 `3IC60_LL_H40`). 서버 `scanbodyLibraryIdentity.js`와 같게 둔다.
const SPEC_CODE = /^((?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+?)_((?:LL|LS|CMFit)(?:_H\d+(?:\.\d+)?)?|H\d+(?:\.\d+)?)$/;

/** 폴더에 제조사가 없을 때, 지오메디 카탈로그 연결 코드(3ICM·3ICR·3ICW·3IC60)면 지오메디로 본다. */
const GEOMEDI_CONNECTION = /^3IC(?:M|R|W|\d{2})$/i;

const MAKER_ALIAS_GROUPS = [
  ["osstem", "오스템", "오스템us", "osstemus"],
  ["neobiotech", "네오바이오텍", "네오", "neo"],
  ["dentium", "덴티움"],
  ["dio", "디오"],
  ["megagen", "메가젠"],
  ["dentis", "덴티스"],
  ["geomedi", "지오메디", "geo"],
] as const;

export const makerKey = (value: string) => value.toLowerCase().replace(/[\s·._-]+/g, "");

const SPEC_ONLY_FAMILY = new Set(["ll", "ls", "cmfit", "cm"]);

export function splitScanbodyCode(name: string) {
  const raw = name.trim();
  const match = raw.match(SPEC_CODE);
  if (!match || SPEC_ONLY_FAMILY.has((match[1] ?? "").toLowerCase())) return { family: raw, spec: "", code: raw };
  return { family: match[1] ?? raw, spec: (match[2] ?? "").replace(/_/g, " "), code: raw };
}

export type LibraryIdentitySource = {
  systemName: string;
  implantManufacturer?: string;
  brand?: string;
  implantType?: string;
  manufacturers?: string[];
  fileNames?: string[];
};

export type LibraryIdentity = {
  manufacturer: string;
  brand: string;
  implantType: string;
  spec: string;
  code: string;
  title: string;
  groupKey: string;
};

/** 저장된 메타가 있으면 그것을 쓰고, 없으면 시스템 코드에서 연결·규격을 나눈다. */
export function identityOfLibrary(lib: LibraryIdentitySource): LibraryIdentity {
  const code = splitScanbodyCode(lib.systemName);
  const brand = (lib.brand || "").trim();
  const storedType = (lib.implantType || "").trim();
  const family = code.spec ? code.family : "";
  let manufacturer = (lib.implantManufacturer || "").trim();
  if (!manufacturer && GEOMEDI_CONNECTION.test(family)) manufacturer = "지오메디";
  const implantType = storedType || family;
  const title =
    [manufacturer, brand, implantType].filter(Boolean).join(" ") || (code.spec ? code.family : lib.systemName.trim()) || "스캔바디";
  const groupKey = [makerKey(manufacturer), makerKey(brand), makerKey(code.spec ? code.family : title)].join("|");
  return { manufacturer, brand, implantType, spec: code.spec, code: code.code, title, groupKey };
}

export type RegisteredLibraryGroup<T extends LibraryIdentitySource & { id: string; scope: string; ownerName?: string }> = {
  key: string;
  title: string;
  manufacturer: string;
  brand: string;
  implantType: string;
  libs: T[];
};

/** 같은 제조사·브랜드·연결이고 규격만 다른 라이브러리를 한 장으로 묶는다. */
export function groupRegisteredLibraries<T extends LibraryIdentitySource & { id: string; scope: string; ownerName?: string }>(
  libs: readonly T[],
): RegisteredLibraryGroup<T>[] {
  const groups = new Map<string, RegisteredLibraryGroup<T>>();
  for (const lib of libs) {
    const identity = identityOfLibrary(lib);
    const key = `${identity.groupKey}|${lib.scope}|${lib.ownerName || ""}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        key,
        title: identity.title,
        manufacturer: identity.manufacturer,
        brand: identity.brand,
        implantType: identity.implantType,
        libs: [lib],
      });
      continue;
    }
    group.libs.push(lib);
    if (identity.manufacturer && !group.manufacturer) {
      group.manufacturer = identity.manufacturer;
      group.brand = identity.brand;
      group.implantType = identity.implantType || group.implantType;
      group.title = identity.title;
    }
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

function aliasGroup(key: string) {
  return MAKER_ALIAS_GROUPS.find((group) => group.some((alias) => makerKey(alias) === key));
}

function labelHits(label: string, key: string, aliasKeys: Set<string> | null) {
  const parts = label
    .split(/[\s·./_\\-]+/)
    .map(makerKey)
    .filter(Boolean);
  const tokens = parts.length > 0 ? parts : [makerKey(label)];
  return tokens.some((token) => token === key || Boolean(aliasKeys?.has(token)));
}

/** 먼저 보여 줄 주력 제조사(시스템에 등록된 임플란트 제조사). 지오메디 같은 카탈로그 묶음은 뺀다. */
const PRIORITY_MAKERS = ["osstem", "neobiotech", "dentium", "dio", "megagen", "dentis"] as const;

/** 라이브러리가 주력 제조사 것이면 true. 나머지는 화면에서 개수만 보이고 검색 때 찾는다. */
export function isPriorityMakerLibrary(lib: LibraryIdentitySource) {
  return PRIORITY_MAKERS.some((maker) => {
    const label = MAKER_ALIAS_GROUPS.find((group) => group[0] === maker)?.[1] ?? maker;
    return libraryMatchesMaker(lib, label) || libraryMatchesMaker(lib, maker);
  });
}

/** 의뢰 스캔바디 제조사가 이 라이브러리의 제조사·브랜드·코드와 맞는지. */
export function libraryMatchesMaker(lib: LibraryIdentitySource, maker: string) {
  const key = makerKey(maker);
  if (!key) return false;
  const identity = identityOfLibrary(lib);
  const labels = [
    ...(lib.manufacturers ?? []),
    lib.implantManufacturer,
    lib.brand,
    lib.implantManufacturer && lib.brand ? `${lib.implantManufacturer} ${lib.brand}` : "",
    lib.systemName,
    identity.manufacturer,
    identity.title,
    ...(lib.fileNames ?? []),
  ].filter((label): label is string => Boolean(label && label.trim()));
  const group = aliasGroup(key);
  const aliasKeys = group ? new Set(group.map((alias) => makerKey(alias))) : null;
  return labels.some((label) => labelHits(label, key, aliasKeys));
}
