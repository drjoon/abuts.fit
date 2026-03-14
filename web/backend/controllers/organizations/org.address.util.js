import { URL } from "node:url";

function extractPostalCodeFromGeocodingResult(result) {
  const components = Array.isArray(result?.address_components)
    ? result.address_components
    : [];
  const postal = components.find(
    (item) => Array.isArray(item?.types) && item.types.includes("postal_code"),
  );
  return String(postal?.long_name || postal?.short_name || "").trim();
}

export function buildAddressCandidates(address) {
  const raw = String(address || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) return [];

  const withoutParen = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const beforeComma = raw.split(",")[0]?.trim() || "";
  const beforeDongHo = raw
    .replace(/\b\d+동\b.*$/u, "")
    .replace(/\b\d+호\b.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return [...new Set([raw, withoutParen, beforeComma, beforeDongHo].filter(Boolean))];
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractFirstXmlTagValue(xml, tagName) {
  const match = String(xml || "").match(
    new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"),
  );
  return decodeXmlText(match?.[1] || "");
}

function extractXmlItemList(xml) {
  const source = String(xml || "");
  const matches = [...source.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return matches.map((match) => {
    const itemXml = match?.[1] || "";
    return {
      zipNo: extractFirstXmlTagValue(itemXml, "zipNo"),
      lnmAdres: extractFirstXmlTagValue(itemXml, "lnmAdres"),
      rnAdres: extractFirstXmlTagValue(itemXml, "rnAdres"),
      ctpNm: extractFirstXmlTagValue(itemXml, "ctpNm"),
      sggNm: extractFirstXmlTagValue(itemXml, "sggNm"),
      emdNm: extractFirstXmlTagValue(itemXml, "emdNm"),
      liNm: extractFirstXmlTagValue(itemXml, "liNm"),
      rn: extractFirstXmlTagValue(itemXml, "rn"),
      buldMnnm: extractFirstXmlTagValue(itemXml, "buldMnnm"),
      buldSlno: extractFirstXmlTagValue(itemXml, "buldSlno"),
    };
  });
}

async function requestEpostPostalLookup(address) {
  const serviceKey = String(
    process.env.EPOST_POSTAL_SERVICE_KEY ||
      process.env.DATA_GO_KR_SERVICE_KEY ||
      process.env.SERVICE_KEY ||
      "",
  )
    .trim()
    .replace(/^"|"$/g, "");

  if (!serviceKey) {
    throw Object.assign(new Error("SERVICE_KEY가 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }

  const url = new URL(
    "http://openapi.epost.go.kr/postal/retrieveLotNumberAdressAreaCdService/retrieveLotNumberAdressAreaCdService/getDetailListAreaCd",
  );
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("searchSe", "road");
  url.searchParams.set("srchwrd", address);
  url.searchParams.set("countPerPage", "10");
  url.searchParams.set("currentPage", "1");

  const response = await fetch(url.toString(), { method: "GET" });
  const xml = await response.text();

  if (!response.ok) {
    throw Object.assign(new Error("epost 주소 우편번호 조회에 실패했습니다."), {
      statusCode: response.status || 502,
      data: xml,
    });
  }

  const items = extractXmlItemList(xml);
  const first = items.find((item) => String(item.zipNo || "").trim()) || items[0];

  return {
    postalCode: String(first?.zipNo || "").trim(),
    formattedAddress: String(first?.rnAdres || first?.lnmAdres || "").trim(),
    raw: xml,
  };
}

async function requestGoogleGeocode(address) {
  const apiKey = String(process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw Object.assign(new Error("GOOGLE_API_KEY가 설정되지 않았습니다."), {
      statusCode: 500,
    });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "ko");
  url.searchParams.set("region", "kr");

  const response = await fetch(url.toString(), { method: "GET" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error("주소 우편번호 조회에 실패했습니다."), {
      statusCode: response.status || 502,
      data,
    });
  }

  return data;
}

export async function lookupPostalCodeByAddress(address) {
  const candidates = buildAddressCandidates(address);
  let lastData = null;

  for (const candidate of candidates) {
    try {
      const epostData = await requestEpostPostalLookup(candidate);
      lastData = epostData.raw;
      if (epostData.postalCode) {
        return {
          postalCode: epostData.postalCode,
          formattedAddress: epostData.formattedAddress,
          matchedAddress: candidate,
          provider: "epost",
          raw: epostData.raw,
        };
      }
    } catch (error) {
      lastData = error?.data || lastData;
    }

    try {
      const data = await requestGoogleGeocode(candidate);
      lastData = data;
      const results = Array.isArray(data?.results) ? data.results : [];
      for (const result of results) {
        const postalCode = extractPostalCodeFromGeocodingResult(result);
        if (postalCode) {
          return {
            postalCode,
            formattedAddress: String(result?.formatted_address || "").trim(),
            matchedAddress: candidate,
            provider: "google",
            raw: data,
          };
        }
      }
    } catch (error) {
      lastData = error?.data || lastData;
    }
  }

  return {
    postalCode: "",
    formattedAddress: String(lastData?.results?.[0]?.formatted_address || "").trim(),
    matchedAddress: candidates[0] || "",
    provider: "",
    raw: lastData,
  };
}

export async function normalizeOrganizationAddressFields({ address, zipCode }) {
  const rawAddress = String(address || "").trim();
  const rawZipCode = String(zipCode || "").trim();
  if (!rawAddress) {
    return {
      address: "",
      zipCode: rawZipCode,
      provider: "",
      matchedAddress: "",
    };
  }

  try {
    const lookup = await lookupPostalCodeByAddress(rawAddress);
    const normalizedAddress = String(lookup?.formattedAddress || rawAddress).trim();
    const normalizedZipCode = String(lookup?.postalCode || rawZipCode).trim();

    return {
      address: normalizedAddress || rawAddress,
      zipCode: normalizedZipCode,
      provider: String(lookup?.provider || "").trim(),
      matchedAddress: String(lookup?.matchedAddress || "").trim(),
    };
  } catch (error) {
    return {
      address: rawAddress,
      zipCode: rawZipCode,
      provider: "",
      matchedAddress: rawAddress,
    };
  }
}
