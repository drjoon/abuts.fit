import { test, expect, type Page } from "@playwright/test";

const getEnv = (key: string) => {
  return String(process.env?.[key] || "").trim();
};

const isTruthy = (v: string) => {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
};

const login = async (page: Page, email: string, password: string) => {
  if (!email.includes("@")) {
    throw new Error(
      `E2E login failed: invalid email format (missing '@'): ${JSON.stringify(
        email
      )}`
    );
  }
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.locator("form").getByRole("button", { name: "로그인" }).click();

  const result = await Promise.race<"dashboard" | "login_failed">([
    page
      .waitForURL(/\/dashboard/, { timeout: 30_000 })
      .then(() => "dashboard" as const),
    page
      .getByText("로그인 실패")
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => "login_failed" as const)
      .catch(() => "login_failed" as const),
  ]);

  if (result !== "dashboard") {
    throw new Error(
      "E2E login failed: did not navigate to /dashboard (likely 401 or invalid credentials)."
    );
  }
};

const expectSomeGuideFocusActive = async (page: Page) => {
  await expect(page.locator('[data-guide-active="1"]').first()).toBeVisible({
    timeout: 20_000,
  });
};

test.describe("requestor guide tour", () => {
  test("로그인 후 온보딩/신규의뢰 투어가 하이라이트를 표시한다", async ({
    page,
  }: {
    page: Page;
  }) => {
    const useMock = isTruthy(getEnv("E2E_USE_MOCK"));
    const email =
      (useMock ? getEnv("E2E_MOCK_EMAIL") : "") ||
      getEnv("E2E_ID") ||
      getEnv("E2E_EMAIL") ||
      (useMock ? "requestor.principal@demo.abuts.fit" : "");
    const password =
      (useMock ? getEnv("E2E_MOCK_PASSWORD") : "") ||
      getEnv("E2E_PW") ||
      getEnv("E2E_PASSWORD") ||
      (useMock ? "a64468ff-514b" : "");

    test.skip(
      !email || !password,
      "E2E_ID/E2E_PW (또는 E2E_EMAIL/E2E_PASSWORD) 환경변수가 필요합니다."
    );

    await login(page, email, password);

    await expectSomeGuideFocusActive(page);

    const url = page.url();
    expect(url).toMatch(/\/dashboard\/(settings|new-request)/);
  });

  test("(옵션) 온보딩 미완료 계정은 settings로 가고, business 단계면 business 탭으로 이동한다", async ({
    page,
  }: {
    page: Page;
  }) => {
    const useMock = isTruthy(getEnv("E2E_USE_MOCK"));
    const email = getEnv("E2E_INCOMPLETE_ID") || getEnv("E2E_INCOMPLETE_EMAIL");
    const password =
      getEnv("E2E_INCOMPLETE_PW") || getEnv("E2E_INCOMPLETE_PASSWORD");

    test.skip(
      useMock,
      "mock 로그인은 demo 계정(완료/권한 상태가 고정)이라 미완료 시나리오 테스트를 스킵합니다."
    );

    test.skip(
      !email || !password,
      "E2E_INCOMPLETE_ID/E2E_INCOMPLETE_PW (또는 E2E_INCOMPLETE_EMAIL/E2E_INCOMPLETE_PASSWORD) 환경변수가 필요합니다."
    );

    await login(page, email, password);

    await page.waitForURL(/\/dashboard\/settings/, { timeout: 30_000 });
    await expectSomeGuideFocusActive(page);

    const tab = new URL(page.url()).searchParams.get("tab");
    expect(["account", "business"]).toContain(tab);
  });
});
