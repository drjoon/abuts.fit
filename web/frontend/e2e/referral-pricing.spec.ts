import { test, expect, type Page } from "@playwright/test";

const getEnv = (key: string) => String(process.env?.[key] || "").trim();

const isTruthy = (v: string) => {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
};

const login = async (page: Page, email: string, password: string) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.locator("form").getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
};

const getAuthHeaders = async (page: Page) => {
  const token = await page.evaluate(() => {
    try {
      return localStorage.getItem("abuts_auth_token") || "";
    } catch {
      return "";
    }
  });
  if (!token) {
    throw new Error("E2E: missing abuts_auth_token in localStorage");
  }
  return {
    Authorization: `Bearer ${token}`,
  };
};

const apiGet = async <T = any>(page: Page, path: string): Promise<T> => {
  const headers = await getAuthHeaders(page);
  const res = await page.request.get(path, { headers });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as T;
};

const apiPost = async <T = any>(
  page: Page,
  path: string,
  json?: any
): Promise<T> => {
  const headers = await getAuthHeaders(page);
  const res = await page.request.post(path, { data: json || {}, headers });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as T;
};

test.describe("referral & pricing policy (A안)", () => {
  test("A/B는 90일 이후 volume discount 규칙이 적용되고, A는 referral 합산으로 할인폭이 더 크다", async ({
    page,
  }) => {
    const useMock = isTruthy(getEnv("E2E_USE_MOCK"));
    test.skip(
      useMock,
      "이 테스트는 DB seed 기반이라 mock 로그인을 스킵합니다."
    );

    const prefix = (getEnv("E2E_RP_PREFIX") || "e2e.rp").toLowerCase();
    const domain = getEnv("E2E_RP_DOMAIN") || "demo.abuts.fit";
    const password = getEnv("E2E_RP_PASSWORD") || getEnv("E2E_PW");

    const emailA = `${prefix}.a@${domain}`;
    const emailB = `${prefix}.b@${domain}`;

    test.skip(
      !password,
      "E2E_RP_PASSWORD (또는 E2E_PW) 환경변수가 필요합니다."
    );

    await login(page, emailA, password);

    const statsA: any = await apiGet(
      page,
      "/api/requests/my/pricing-referral-stats"
    );
    expect(statsA?.success).toBeTruthy();
    expect(statsA?.data?.rule).toBe("volume_discount_last30days");

    const totalA = Number(statsA?.data?.totalOrders || 0);
    const unitA = Number(statsA?.data?.effectiveUnitPrice || 0);
    expect(totalA).toBeGreaterThan(0);
    expect(unitA).toBeGreaterThan(0);
    expect(unitA).toBeLessThanOrEqual(15000);

    await login(page, emailB, password);

    const statsB: any = await apiGet(
      page,
      "/api/requests/my/pricing-referral-stats"
    );
    expect(statsB?.success).toBeTruthy();
    expect(statsB?.data?.rule).toBe("volume_discount_last30days");

    const totalB = Number(statsB?.data?.totalOrders || 0);
    const unitB = Number(statsB?.data?.effectiveUnitPrice || 0);

    // seed 기준: A의 totalOrders(=A + B + C) > B의 totalOrders(=B + D + E + F)
    expect(totalA).toBeGreaterThan(totalB);

    // totalOrders가 더 크면 단가는 더 낮아야 함(할인 증가)
    expect(unitA).toBeLessThan(unitB);
  });

  test("C는 paidBalance=0(환불 처리 완료) 상태에서 withdraw가 성공한다", async ({
    page,
  }) => {
    const useMock = isTruthy(getEnv("E2E_USE_MOCK"));
    test.skip(
      useMock,
      "이 테스트는 DB seed 기반이라 mock 로그인을 스킵합니다."
    );

    const prefix = (getEnv("E2E_RP_PREFIX") || "e2e.rp").toLowerCase();
    const domain = getEnv("E2E_RP_DOMAIN") || "demo.abuts.fit";
    const password = getEnv("E2E_RP_PASSWORD") || getEnv("E2E_PW");

    const emailC = `${prefix}.c@${domain}`;
    test.skip(
      !password,
      "E2E_RP_PASSWORD (또는 E2E_PW) 환경변수가 필요합니다."
    );

    await login(page, emailC, password);

    const balance: any = await apiGet(page, "/api/credits/balance");
    expect(balance?.success).toBeTruthy();
    expect(Number(balance?.data?.paidBalance || 0)).toBe(0);

    const withdraw: any = await apiPost(page, "/api/auth/withdraw", {
      bank: "E2E",
      accountNumber: "000-0000-0000",
      holderName: "E2E",
    });

    expect(withdraw?.success).toBeTruthy();

    // withdraw 후 재로그인 시도는 실패해야 정상
    await page.goto("/login");
    await page.getByLabel("이메일").fill(emailC);
    await page.getByLabel("비밀번호").fill(password);
    await page.locator("form").getByRole("button", { name: "로그인" }).click();

    await expect(page.getByText("로그인 실패").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
