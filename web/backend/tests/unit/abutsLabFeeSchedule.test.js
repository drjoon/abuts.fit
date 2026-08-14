// related files:
// - web/backend/utils/abutsLabFeeSchedule.js
// - web/backend/utils/labFeeSchedule.js
import {
  buildDefaultAbutsLabFeeItems,
  buildPendingAbutsItemsFromLabFees,
  normalizeAbutsLabFeeItems,
} from "../../utils/abutsLabFeeSchedule.js";

describe("abutsLabFeeSchedule pending sync", () => {
  test("기공소 신규 이름만 off·pending으로 추가한다", () => {
    const catalog = buildDefaultAbutsLabFeeItems();
    const added = buildPendingAbutsItemsFromLabFees({
      catalogItems: catalog,
      labItems: [
        { id: "crown", name: "크라운", unit: "perTooth", enabled: true, price: 50000 },
        {
          id: "custom-1",
          name: "올세라믹",
          unit: "perTooth",
          enabled: true,
          price: 120000,
        },
      ],
      labName: "테스트기공소",
      labAnchorId: "lab-1",
      proposedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(added).toHaveLength(1);
    expect(added[0].name).toBe("올세라믹");
    expect(added[0].enabled).toBe(false);
    expect(added[0].pendingReview).toBe(true);
    expect(added[0].price).toBe(120000);
    expect(added[0].proposedByLabName).toBe("테스트기공소");
    expect(added[0].proposedByLabAnchorId).toBe("lab-1");
  });

  test("이미 카탈로그에 있는 이름은 다시 추가하지 않는다", () => {
    const catalog = [
      ...buildDefaultAbutsLabFeeItems(),
      {
        id: "pending-1",
        name: "올세라믹",
        unit: "perTooth",
        enabled: false,
        price: 100000,
        remake: 0,
        tiers: [],
        pendingReview: true,
      },
    ];
    const added = buildPendingAbutsItemsFromLabFees({
      catalogItems: catalog,
      labItems: [
        {
          id: "x",
          name: "올세라믹",
          unit: "perTooth",
          enabled: true,
          price: 99999,
        },
      ],
      labName: "다른기공소",
    });
    expect(added).toHaveLength(0);
  });

  test("On으로 저장하면 pendingReview가 해제된다", () => {
    const items = normalizeAbutsLabFeeItems([
      {
        id: "pending-1",
        name: "올세라믹",
        unit: "perTooth",
        enabled: true,
        price: 120000,
        remake: 0,
        tiers: [],
        pendingReview: true,
        proposedByLabName: "테스트기공소",
      },
    ]);
    const found = items.find((item) => item.name === "올세라믹");
    expect(found).toBeTruthy();
    expect(found.enabled).toBe(true);
    expect(found.pendingReview).toBeUndefined();
  });
});
