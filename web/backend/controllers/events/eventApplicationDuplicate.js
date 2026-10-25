// related files:
// - web/backend/controllers/events/eventInlineSignup.controller.js
// - web/backend/controllers/events/marketingEvent.controller.js
//
// 치과명·원장명만 같으면 다른 치과일 수 있다.
// 주소 또는 전화번호가 같을 때만 같은 신청으로 본다.

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneSet(values) {
  return new Set(
    values.map(phoneDigits).filter((digits) => digits.length >= 9),
  );
}

export function matchesClinicIdentity(existing, wanted) {
  const address = compactText(wanted?.address);
  const sameAddress =
    Boolean(address) && compactText(existing?.practice?.address) === address;
  const wantedPhones = phoneSet([
    wanted?.applicantPhone,
    wanted?.practicePhone,
  ]);
  const existingPhones = phoneSet([
    existing?.applicantPhone,
    existing?.practice?.phone,
  ]);
  const samePhone = [...wantedPhones].some((digits) =>
    existingPhones.has(digits),
  );
  return sameAddress || samePhone;
}

export async function findClinicIdentityDuplicate(
  MarketingEventApplication,
  { eventId, clinicName, directorName, address, applicantPhone, practicePhone },
) {
  const name = String(clinicName || "").trim();
  const director = String(directorName || "").trim();
  if (!eventId || !name || !director) return null;

  const rows = await MarketingEventApplication.find({
    eventId,
    "practice.name": name,
    directorName: director,
    status: { $ne: "rejected" },
  })
    .select({ practice: 1, applicantPhone: 1 })
    .lean();

  return (
    rows.find((row) =>
      matchesClinicIdentity(row, { address, applicantPhone, practicePhone }),
    ) || null
  );
}
