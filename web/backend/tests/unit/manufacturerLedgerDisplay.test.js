// related files:
// - web/backend/utils/manufacturerLedgerDisplay.js
import {
  buildManufacturerMailboxGroups,
  collectManufacturerLedgerLookupIds,
  groupManufacturerLedgerForDisplay,
  isManufacturerLabOriginShippingRow,
  isManufacturerShippingEarnRow,
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
    expect(grouped[0].paidAmount).toBe(18000);
    expect(grouped[0].freeAmount).toBe(9000);
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

  test("lab-origin PTX shipping is not manufacturer shipping", () => {
    const labRow = {
      type: "EARN",
      eventType: "SHIPPING_SPEND_COMMIT",
      amount: 3500,
      creditKind: "PAID",
      refType: "PRACTICE_TRANSFER",
      refId: "555555555555555555555555",
      usageKind: "practice_transfer_lab_shipping",
      uniqueKey: "gl:practice_transfer:555555555555555555555555:lab_shipping",
      occurredAt: "2026-08-17T05:26:00.000Z",
    };
    expect(isManufacturerLabOriginShippingRow(labRow)).toBe(true);
    expect(isManufacturerShippingEarnRow(labRow)).toBe(false);
    expect(groupManufacturerLedgerForDisplay([labRow])).toEqual([]);
  });

  test("payout stays a standalone row", () => {
    const grouped = groupManufacturerLedgerForDisplay([
      {
        _id: "payout",
        type: "PAYOUT",
        amount: 9000,
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

  test("same-day ADJUST rows collapse to one clickable row per request", () => {
    const rows = [
      {
        _id: "a1",
        type: "ADJUST",
        eventType: "ADJUST",
        amount: -9000,
        creditKind: "FREE_REQUEST",
        refType: "REQUEST",
        refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        uniqueKey:
          "gl:request:aaaaaaaaaaaaaaaaaaaaaaaa:machining_spend:1:duplicate_refund",
        occurredAt: "2026-07-30T11:48:07.000Z",
      },
      {
        _id: "a2",
        type: "ADJUST",
        eventType: "ADJUST",
        amount: -9000,
        creditKind: "FREE_REQUEST",
        refType: "REQUEST",
        refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        uniqueKey:
          "gl:request:aaaaaaaaaaaaaaaaaaaaaaaa:machining_spend:2:duplicate_refund",
        occurredAt: "2026-07-30T11:48:07.000Z",
      },
      {
        _id: "b1",
        type: "ADJUST",
        eventType: "ADJUST",
        amount: -9000,
        creditKind: "FREE_REQUEST",
        refType: "REQUEST",
        refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        uniqueKey:
          "gl:request:bbbbbbbbbbbbbbbbbbbbbbbb:machining_spend:1:duplicate_refund",
        occurredAt: "2026-07-30T11:48:07.000Z",
      },
      {
        _id: "b2",
        type: "ADJUST",
        eventType: "ADJUST",
        amount: -9000,
        creditKind: "FREE_REQUEST",
        refType: "REQUEST",
        refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        uniqueKey:
          "gl:request:bbbbbbbbbbbbbbbbbbbbbbbb:machining_spend:2:duplicate_refund",
        occurredAt: "2026-07-30T11:48:07.000Z",
      },
    ];
    const grouped = groupManufacturerLedgerForDisplay(rows, {
      requestsById: new Map([
        [
          "aaaaaaaaaaaaaaaaaaaaaaaa",
          req({
            _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
            requestId: "20260723-KCZNWBVX",
            mailboxAddress: "A1A1",
            caseInfos: {
              clinicName: "알토란기공소",
              patientName: "김동우",
              tooth: "36",
            },
            shippingReceiver: { name: "알토란기공소" },
          }),
        ],
        [
          "bbbbbbbbbbbbbbbbbbbbbbbb",
          req({
            _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
            requestId: "20260723-EYFQXKPE",
            mailboxAddress: "A1A1",
            caseInfos: {
              clinicName: "알토란기공소",
              patientName: "장영훈",
              tooth: "36",
            },
            shippingReceiver: { name: "알토란기공소" },
          }),
        ],
      ]),
    });

    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupKind).toBe("adjust-daily");
    expect(grouped[0].type).toBe("ADJUST");
    expect(grouped[0].ymd).toBe("2026-07-30");
    expect(grouped[0].amount).toBe(-36000);
    expect(grouped[0].requestCount).toBe(2);
    expect(grouped[0].mailboxGroups).toHaveLength(1);
    const items = grouped[0].mailboxGroups[0].items;
    expect(items.map((item) => item.requestId).sort()).toEqual([
      "20260723-EYFQXKPE",
      "20260723-KCZNWBVX",
    ]);
    expect(items.every((item) => item.kind === "adjust")).toBe(true);
    expect(items.every((item) => item.amount === -18000)).toBe(true);
    expect(items.every((item) => item.reason === "중복 적립 정정")).toBe(true);
  });

  test("ADJUST on different KST days stay separate", () => {
    const grouped = groupManufacturerLedgerForDisplay([
      {
        _id: "jul15",
        type: "ADJUST",
        eventType: "ADJUST",
        amount: -9000,
        refType: "REQUEST",
        refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        uniqueKey: "request:aaaaaaaaaaaaaaaaaaaaaaaa:cancel_refund",
        occurredAt: "2026-07-15T09:12:54.000Z",
      },
      {
        _id: "jul30",
        type: "ADJUST",
        eventType: "ADJUST",
        amount: -9000,
        refType: "REQUEST",
        refId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        uniqueKey:
          "request:bbbbbbbbbbbbbbbbbbbbbbbb:machining_spend:1:duplicate_refund",
        occurredAt: "2026-07-30T11:48:07.000Z",
      },
    ]);
    expect(grouped.map((r) => r.ymd)).toEqual(["2026-07-30", "2026-07-15"]);
    expect(grouped.every((r) => r.groupKind === "adjust-daily")).toBe(true);
  });

  test("same mailbox on same day with different BAs stay separate groups", () => {
    const uriBa = "111111111111111111111111";
    const altoranBa = "222222222222222222222222";
    const uriReqId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const altoranReqId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const uriPkgId = "cccccccccccccccccccccccc";
    const altoranPkgId = "dddddddddddddddddddddddd";

    const rows = [
      {
        _id: "prod-uri",
        type: "EARN",
        eventType: "REQUEST_SPEND_COMMIT",
        amount: 8800,
        creditKind: "PAID",
        refType: "REQUEST",
        refId: uriReqId,
        uniqueKey: `request:${uriReqId}:machining_spend`,
        occurredAt: "2026-08-21T08:30:00.000Z",
      },
      {
        _id: "ship-uri",
        type: "EARN",
        eventType: "SHIPPING_SPEND_COMMIT",
        amount: 3500,
        creditKind: "FREE_SHIPPING",
        refType: "SHIPPING_PACKAGE",
        refId: uriPkgId,
        uniqueKey: `shippingPackage:${uriPkgId}:shipping_fee`,
        occurredAt: "2026-08-21T07:02:00.000Z",
      },
      {
        _id: "ship-altoran",
        type: "EARN",
        eventType: "SHIPPING_SPEND_COMMIT",
        amount: 3500,
        creditKind: "FREE_SHIPPING",
        refType: "SHIPPING_PACKAGE",
        refId: altoranPkgId,
        uniqueKey: `shippingPackage:${altoranPkgId}:shipping_fee`,
        occurredAt: "2026-08-21T07:02:01.000Z",
      },
    ];

    const requestsById = new Map([
      [
        uriReqId,
        req({
          _id: uriReqId,
          requestId: "20260821-URI001",
          mailboxAddress: "A1A1",
          businessAnchorId: uriBa,
          anchorName: "우리치과기공소",
          caseInfos: {
            clinicName: "향기로운",
            patientName: "김환자",
            tooth: "11",
          },
        }),
      ],
      [
        altoranReqId,
        req({
          _id: altoranReqId,
          requestId: "20260821-ALT001",
          mailboxAddress: "A1A1",
          businessAnchorId: altoranBa,
          anchorName: "알토란치과기공소",
          caseInfos: {
            clinicName: "알토란기공소",
            patientName: "석태임",
            tooth: "26",
          },
        }),
      ],
    ]);

    const packagesById = new Map([
      [
        uriPkgId,
        {
          id: uriPkgId,
          mailboxAddress: "A1B1",
          requestIds: [uriReqId],
          recipientBusinessAnchorId: uriBa,
          recipientName: "우리치과기공소",
        },
      ],
      [
        altoranPkgId,
        {
          id: altoranPkgId,
          mailboxAddress: "A1A1",
          requestIds: [altoranReqId],
          recipientBusinessAnchorId: altoranBa,
          recipientName: "알토란치과기공소",
        },
      ],
    ]);

    const grouped = groupManufacturerLedgerForDisplay(rows, {
      requestsById,
      packagesById,
    });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].shippingCount).toBe(2);
    expect(grouped[0].shippingAmount).toBe(7000);

    const shippingNames = grouped[0].mailboxGroups
      .filter((g) => g.shippingCount > 0)
      .map((g) => g.recipientName)
      .sort();
    expect(shippingNames).toEqual(["알토란치과기공소", "우리치과기공소"]);

    const a1a1Altoran = grouped[0].mailboxGroups.find(
      (g) =>
        g.mailboxAddress === "A1A1" &&
        g.recipientBusinessAnchorId === altoranBa,
    );
    expect(a1a1Altoran.recipientName).toBe("알토란치과기공소");
    expect(a1a1Altoran.shippingAmount).toBe(3500);

    const a1a1UriProd = grouped[0].mailboxGroups.find(
      (g) =>
        g.mailboxAddress === "A1A1" && g.recipientBusinessAnchorId === uriBa,
    );
    expect(a1a1UriProd.recipientName).toBe("우리치과기공소");
    expect(a1a1UriProd.productionAmount).toBe(8800);
    expect(a1a1UriProd.shippingAmount).toBe(0);
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

  test("PTX request group label uses requestor BA, not clinicName", () => {
    const summary = summarizeManufacturerLedgerRequest({
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      requestId: "20260821-000001",
      mailboxAddress: "A1A1",
      businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      anchorName: "향기로운기공소",
      caseInfos: {
        clinicName: "평온치과",
        patientName: "김환자",
        tooth: "11",
      },
      shippingReceiver: { name: "평온치과" },
      partnerBilling: {
        relatedPracticeTransferId: "cccccccccccccccccccccccc",
        practiceBusinessAnchorId: "dddddddddddddddddddddddd",
      },
    });
    expect(summary.recipientName).toBe("향기로운기공소");
    expect(summary.clinicName).toBe("평온치과");
    expect(summary.recipientBusinessAnchorId).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbb",
    );

    const groups = buildManufacturerMailboxGroups(
      [
        {
          type: "EARN",
          eventType: "REQUEST_SPEND_COMMIT",
          amount: 8800,
          creditKind: "PAID",
          refType: "REQUEST",
          refId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      {
        requestsById: new Map([["aaaaaaaaaaaaaaaaaaaaaaaa", summary]]),
        packagesById: new Map(),
        requestsByPtxId: new Map(),
      },
    );
    expect(groups[0].recipientName).toBe("향기로운기공소");
    expect(groups[0].items[0].clinicName).toBe("평온치과");
  });
});
