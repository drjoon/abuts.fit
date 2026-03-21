export async function allocateVirtualMailboxAddress(requestorOrgId) {
  const { default: Request } = await import("../../models/request.model.js");

  // 선반(Shelf)은 실제 운용 중인 A부터 I까지 9개를 사용한다.
  const shelfNames = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  // 선반 내 수직 위치(Row)는 1, 2, 3, 4 (위에서부터 1번. 사진의 2번째 줄이 1번, 맨 아랫줄이 4번)
  const shelfRows = ["1", "2", "3", "4"];
  // 플라스틱 박스(Bin) 내 열(Col)은 3개 (A, B, C)
  const binCols = ["A", "B", "C"];
  // 플라스틱 박스(Bin) 내 행(Row)은 4개 (1, 2, 3, 4)
  const binRows = ["1", "2", "3", "4"];

  const allAddresses = [];
  for (const shelf of shelfNames) {
    for (const sRow of shelfRows) {
      for (const bCol of binCols) {
        for (const bRow of binRows) {
          allAddresses.push(`${shelf}${sRow}${bCol}${bRow}`);
        }
      }
    }
  }

  // 현재 '세척.패킹' 및 '포장.발송' 단계에 있는 의뢰들의 할당된 우편함 조회
  const activeRequests = await Request.find({
    manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
    mailboxAddress: { $ne: null },
  })
    .select("mailboxAddress businessAnchorId")
    .lean();

  // 같은 의뢰자가 이미 할당받은 우편함이 있는지 확인
  if (requestorOrgId) {
    const requestorOrgIdStr = requestorOrgId.toString();

    for (const r of activeRequests) {
      const orgId = r.businessAnchorId?.toString() || "";

      if (orgId && orgId === requestorOrgIdStr) {
        return r.mailboxAddress;
      }
    }
  }

  // 사용 중인 우편함 주소 목록
  const usedAddresses = new Set(activeRequests.map((r) => r.mailboxAddress));

  // 사용 중이지 않은 첫 번째 주소 찾기
  const availableAddress = allAddresses.find(
    (addr) => !usedAddresses.has(addr),
  );

  if (!availableAddress) {
    throw new Error("할당 가능한 빈 우편함이 없습니다.");
  }

  return availableAddress;
}
