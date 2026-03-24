import { test, expect } from "@playwright/test";
import { ACCOUNTS, loginAndSkipWizard, visitPage } from "./helpers";

const ACCOUNT = ACCOUNTS.admin;

const ADMIN_PAGES = [
  { path: "/dashboard", label: "대시보드" },
  { path: "/dashboard/businesses", label: "사업자" },
  { path: "/dashboard/users", label: "사용자" },
  { path: "/dashboard/credits", label: "크레딧" },
  { path: "/dashboard/referral-groups", label: "소개그룹" },
  { path: "/dashboard/monitoring", label: "의룢 모니터링" }, // 의룢
  { path: "/dashboard/payments", label: "정산" },
  { path: "/dashboard/tax-invoices", label: "세금계산서" },
  { path: "/dashboard/chat-management", label: "채팅" },
  { path: "/dashboard/sms", label: "메시지" },
  { path: "/dashboard/mail", label: "메일" },
  { path: "/dashboard/inquiries", label: "문의" },
  { path: "/dashboard/security-settings", label: "보안" },
  { path: "/dashboard/settings", label: "설정" },
];

test.describe("Admin – 전체 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNT);
  });

  for (const { path, label } of ADMIN_PAGES) {
    test(`페이지 렌더링: ${label} (${path})`, async ({ page }) => {
      await visitPage(page, path, label);
    });
  }

  test("설정 탭 – 계정", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=account", "설정 > 계정");
  });

  test("설정 탭 – 보안", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=security", "설정 > 보안");
  });

  test("사용자 관리 – 역할 필터 (requestor)", async ({ page }) => {
    await page.goto("/dashboard/users?role=requestor");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.length).toBeGreaterThan(10);
  });

  test("사용자 관리 – 역할 필터 (manufacturer)", async ({ page }) => {
    await page.goto("/dashboard/users?role=manufacturer");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.length).toBeGreaterThan(10);
  });

  test("크레딧 페이지 – 조직 목록 로드", async ({ page }) => {
    await page.goto("/dashboard/credits");
    await page.waitForLoadState("networkidle");
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.length).toBeGreaterThan(10);
  });

  test("타 롤 접근 차단 – requestor 전용 페이지", async ({ page }) => {
    await page.goto("/dashboard/new-request");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("new-request");
  });

  test("타 롤 접근 차단 – manufacturer 전용 페이지", async ({ page }) => {
    await page.goto("/dashboard/worksheet");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("worksheet");
  });
});
