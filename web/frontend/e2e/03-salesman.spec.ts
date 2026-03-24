import { test, expect } from "@playwright/test";
import { ACCOUNTS, loginAndSkipWizard, visitPage } from "./helpers";

const ACCOUNT = ACCOUNTS.salesman;

const SALESMAN_PAGES = [
  { path: "/dashboard", label: "대시보드" },
  { path: "/dashboard/referral-groups", label: "소개" },
  { path: "/dashboard/payments", label: "정산" },
  { path: "/dashboard/inquiries", label: "문의" },
  { path: "/dashboard/settings", label: "설정" },
];

test.describe("Salesman – 전체 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNT);
  });

  for (const { path, label } of SALESMAN_PAGES) {
    test(`페이지 렌더링: ${label} (${path})`, async ({ page }) => {
      await visitPage(page, path, label);
    });
  }

  test("설정 탭 – 계정", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=account", "설정 > 계정");
  });

  test("설정 탭 – 사업자", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=business", "설정 > 사업자");
  });

  test("설정 탭 – 정산", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=payout", "설정 > 정산");
  });

  test("소개 대시보드 – 통계 카드 존재", async ({ page }) => {
    await page.goto("/dashboard/referral-groups");
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

  test("타 롤 접근 차단 – admin 전용 페이지", async ({ page }) => {
    await page.goto("/dashboard/users");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("/users");
  });
});
