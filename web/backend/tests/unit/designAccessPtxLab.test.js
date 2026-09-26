// related files:
// - web/backend/utils/designAccess.js
import {
  canClaimOrHandoffDesignRequest,
  isAcceptingLabForPtxDesignRequest,
  isPtxLinkedDesignRequest,
} from "../../utils/designAccess.js";

describe("designAccess PTX lab designer helpers", () => {
  const labUser = {
    role: "requestor",
    businessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const otherLab = {
    role: "requestor",
    businessAnchorId: "bbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const ptxRequest = {
    businessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    partnerBilling: { relatedPracticeTransferId: "cccccccccccccccccccccccc" },
    caseInfos: { productMode: "design_custom_abutment" },
  };
  const directRequest = {
    businessAnchorId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    partnerBilling: {},
    caseInfos: { productMode: "design_custom_abutment" },
  };

  test("isPtxLinkedDesignRequest", () => {
    expect(isPtxLinkedDesignRequest(ptxRequest)).toBe(true);
    expect(isPtxLinkedDesignRequest(directRequest)).toBe(false);
    expect(isPtxLinkedDesignRequest({})).toBe(false);
  });

  test("isAcceptingLabForPtxDesignRequest", () => {
    expect(isAcceptingLabForPtxDesignRequest(labUser, ptxRequest)).toBe(true);
    expect(isAcceptingLabForPtxDesignRequest(otherLab, ptxRequest)).toBe(false);
    expect(isAcceptingLabForPtxDesignRequest(labUser, directRequest)).toBe(
      false,
    );
    // 작업취소 후 재수락: Request 소유는 이전 lab, transferLab은 현재 lab
    expect(
      isAcceptingLabForPtxDesignRequest(
        otherLab,
        ptxRequest,
        otherLab.businessAnchorId,
      ),
    ).toBe(true);
    expect(
      isAcceptingLabForPtxDesignRequest(
        otherLab,
        ptxRequest,
        labUser.businessAnchorId,
      ),
    ).toBe(false);
  });

  test("canClaimOrHandoffDesignRequest — PTX only accepting lab", async () => {
    expect(await canClaimOrHandoffDesignRequest(labUser, ptxRequest)).toBe(
      true,
    );
    expect(await canClaimOrHandoffDesignRequest(otherLab, ptxRequest)).toBe(
      false,
    );
    expect(
      await canClaimOrHandoffDesignRequest(
        { role: "admin", businessAnchorId: otherLab.businessAnchorId },
        ptxRequest,
      ),
    ).toBe(true);
    expect(
      await canClaimOrHandoffDesignRequest(otherLab, ptxRequest, {
        transferTargetLabAnchorId: otherLab.businessAnchorId,
      }),
    ).toBe(true);
    expect(
      await canClaimOrHandoffDesignRequest(otherLab, ptxRequest, {
        transferTargetLabAnchorId: labUser.businessAnchorId,
      }),
    ).toBe(false);
  });

  test("cooperation assignee can handoff when the request is owned by the prime", async () => {
    const primeId = labUser.businessAnchorId;
    const assigneeId = otherLab.businessAnchorId;
    const cooperationRequest = {
      ...ptxRequest,
      businessAnchorId: primeId,
    };
    const labs = {
      targetLabAnchorId: primeId,
      assigneeLabAnchorId: assigneeId,
    };
    expect(
      isAcceptingLabForPtxDesignRequest(otherLab, cooperationRequest, labs),
    ).toBe(true);
    expect(
      isAcceptingLabForPtxDesignRequest(labUser, cooperationRequest, labs),
    ).toBe(false);
    expect(
      isAcceptingLabForPtxDesignRequest(
        { role: "requestor", businessAnchorId: "dddddddddddddddddddddddd" },
        cooperationRequest,
        labs,
      ),
    ).toBe(false);
    expect(
      await canClaimOrHandoffDesignRequest(otherLab, cooperationRequest, {
        transferTargetLabAnchorId: primeId,
        assigneeLabAnchorId: assigneeId,
      }),
    ).toBe(true);
    expect(
      await canClaimOrHandoffDesignRequest(
        { role: "requestor", businessAnchorId: "dddddddddddddddddddddddd" },
        cooperationRequest,
        {
          transferTargetLabAnchorId: primeId,
          assigneeLabAnchorId: assigneeId,
        },
      ),
    ).toBe(false);
  });
});
