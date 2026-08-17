// related files:
// - web/backend/utils/manufacturerLedgerDisplay.js
import {
  buildManufacturerMailboxGroups,
  collectManufacturerLedgerLookupIds,
  groupManufacturerLedgerForDisplay,
  summarizeManufacturerLedgerRequest,
} from "../../utils/manufacturerLedgerDisplay.js";

function req(overrides = {}) {
  return summarizeManufacturerLedgerRequest({
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    requestId: "20260813-000001",
    mailboxAddress: "A1A1",
    caseInfos: {
      clinicName: "테스트치과",
      patientName: "김환자",
      tooth: "11",
    },
    shippingReceiver: { name: "테스트치과" },
    ...overrides,
  });
}

describe("manufacturerLedgerDisplay", () => {
  test("collects request / package / ptx ids from uniqueKey and ref", () => {
    const ids = collectManufacturerLedgerLookupIds([
      {
        refType: "REQUEST",
        refId: "111111111111111111111111",
        uniqueKey: "gl:request:222222222222222222222222:machining_spend",
      },
      {
        refType: "SHIPPING_PACKAGE",
        refId: "333333333333333333333333",
        uniqueKey: "shippingPackage:444444444444444444444444:shipping_fee",
      },
      {
        refType: "PRACTICE_TRANSFER",
        refId: "555555555555555555555555",
        uniqueKey: "practice_transfer:666666666666666666666666:abuts_shipping",
      },
    ]);
    expect(ids.requestIds.sort()).toEqual([
      "111111111111111111111111",
      "222222222222222222222222",
    ]);
    expect(ids.packageIds.sort()).toEqual([
      "333333333333333333333333",
      "444444444444444444444444",
    ]);
    expect(ids.ptxIds.sort()).toEqual([
      "555555555555555555555555",
      "666666666666666666666666",
    ]);
  });

  test("groups same-day production earns into one row", () => {
    const rows = [
      {
        _id: "1",
        type: "EARN",
        eventType: "REQUEST_SPEND_COMMIT",
        amount: 9000,
        creditKind: "PAID",
        refType: "REQUEST",
        refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        uniqueKey: "request:aaaaaaaaaaaaaaaaaaaaaaaa:machining_spend",
        occurredAt: "2026-08-13T07:00:00.000Z",
      },
      {
        _id: "2",
        type: "EARN",
        eventType: "REQUEST_SPEND_COMMIT",
        amount: 9000,
        creditKind: "PAID",
        refType: "REQUEST",
        refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        uniqueKey: "request:bbbbbbbbbbbbbbbbbbbbbbbb:machining_spend",
        occurredAt: "2026-08-13T06:00:00.000Z",
      },
      {
        _id: "3",
        type: "EARN",
        eventType: "REQUEST_SPEND_COMMIT",
        amount: 9000,
        creditKind: "FREE_REQUEST",
        refType: "REQUEST",
        refId: "cccccccccccccccccccccccc",
        uniqueKey: "request:cccccccccccccccccccccccc:machining_spend",
        occurredAt: "2026-08-13T05:00:00.000Z",
      },
    ];
    const grouped = groupManufacturerLedgerForDisplay(rows, {
      requestsById: new Map([
        ["aaaaaaaaaaaaaaaaaaaaaaaa", req({ _id: "aaaaaaaaaaaaaaaaaaaaaaaa" })],
        [
          "bbbbbbbbbbbbbbbbbbbbbbbb",
          req({
            _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
            requestId: "20260813-000002",
            mailboxAddress: "B2B2",
            caseInfos: { clinicName: "다른치과", patientName: "이환자", tooth: "21" },
            shippingReceiver: { name: "다른치과" },
          }),
        ],
        [
          "cccccccccccccccccccccccc",
          req({
            _id: "cccccccccccccccccccccccc",
            requestId: "20260813-000003",
            mailboxAddress: "A1A1",
            caseInfos: { clinicName: "테스트치과", patientName: "박환자", tooth: "22" },
            shippingReceiver: { name: "테스트치과" },
          }),
        ],
      ]),
    });

    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupKind).toBe("daily");
    expect(grouped[0].ymd).toBe("2026-08-13");
    expect(grouped[0].amount).toBe(27000);
    expect(grouped[0].requestCount).toBe(3);
    expect(grouped[0].shippingCount).toBe(0);
    expect(grouped[0].displayLabel).toBe("커스텀어벗 생산");
    expect(grouped[0].mailboxGroups).toHaveLength(2);
    const a1 = grouped[0].mailboxGroups.find((g) => g.mailboxAddress === "A1A1");
    expect(a1.recipientName).toBe("테스트치과");
    expect(a1.productionCount).toBe(2);
    expect(a1.productionAmount).toBe(18000);
  });

  test("same-day shipping stays in the daily row and mailbox group", () => {
    const rows = [
      {
        _id: "s1",
        type: "EARN",
        eventType: "SHIPPING_SPEND_COMMIT",
        amount: 3500,
        creditKind: "PAID",
        refType: "SHIPPING_PACKAGE",
        refId: "dddddddddddddddddddddddd",
        uniqueKey: "shippingPackage:dddddddddddddddddddddddd:shipping_fee",
        occurredAt: "2026-08-13T08:00:00.000Z",
      },
      {
        _id: "p1",
        type: "EARN",
        eventType: "REQUEST_SPEND_COMMIT",
        amount: 9000,
        creditKind: "PAID",
        refType: "REQUEST",
        refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        uniqueKey: "request:aaaaaaaaaaaaaaaaaaaaaaaa:machining_spend",
        occurredAt: "2026-08-13T07:00:00.000Z",
      },
    ];
    const requestsById = new Map([
      ["aaaaaaaaaaaaaaaaaaaaaaaa", req()],
    ]);
    const grouped = groupManufacturerLedgerForDisplay(rows, {
      requestsById,
      packagesById: new Map([
        [
          "dddddddddddddddddddddddd",
          {
            id: "dddddddddddddddddddddddd",
            mailboxAddress: "A1A1",
            requestIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"],
            recipientName: "테스트치과",
          },
        ],
      ]),
    });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].amount).toBe(12500);
    expect(grouped[0].requestCount).toBe(1);
    expect(grouped[0].shippingCount).toBe(1);
    expect(grouped[0].mailboxGroups).toHaveLength(1);
    expect(grouped[0].mailboxGroups[0].shippingAmount).toBe(3500);
    expect(
      grouped[0].mailboxGroups[0].items.some((item) => item.kind === "shipping"),
    ).toBe(true);
  });

  test("payout stays a standalone row", () => {
    const grouped = groupManufacturerLedgerForDisplay([
      {
        _id: "payout",
        type: "PAYOUT",
        amount: 9900,
        occurredAt: "2026-08-14T01:00:00.000Z",
      },
      {
        _id: "earn",
        type: "EARN",
        eventType: "REQUEST_SPEND_COMMIT",
        amount: 9000,
        creditKind: "PAID",
        refType: "REQUEST",
        refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        occurredAt: "2026-08-13T07:00:00.000Z",
      },
    ]);
    expect(grouped.map((r) => r.groupKind)).toEqual(["single", "daily"]);
    expect(grouped[0].type).toBe("PAYOUT");
  });

  test("mailbox groups fall back to recipient when mailbox is empty", () => {
    const groups = buildManufacturerMailboxGroups(
      [
        {
          type: "EARN",
          eventType: "REQUEST_SPEND_COMMIT",
          amount: 9000,
          creditKind: "PAID",
          refType: "REQUEST",
          refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      {
        requestsById: new Map([
          [
            "aaaaaaaaaaaaaaaaaaaaaaaa",
            req({ mailboxAddress: "", shippingReceiver: { name: "직납치과" } }),
          ],
        ]),
        packagesById: new Map(),
        requestsByPtxId: new Map(),
      },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].mailboxAddress).toBe("");
    expect(groups[0].recipientName).toBe("직납치과");
  });
});
