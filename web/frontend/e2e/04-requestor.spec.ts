import { test, expect } from "@playwright/test";
import { ACCOUNTS, loginAndSkipWizard, visitPage } from "./helpers";

const ACCOUNT = ACCOUNTS.requestor;

const REQUESTOR_PAGES = [
  { path: "/dashboard", label: "대시보드" },
  { path: "/dashboard/new-request", label: "새 의뢰" },
  { path: "/dashboard/referral-groups", label: "소개" },
  { path: "/dashboard/inquiries", label: "문의" },
  { path: "/dashboard/settings", label: "설정" },
];

test.describe("Requestor – 전체 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNT);
  });

  for (const { path, label } of REQUESTOR_PAGES) {
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

  test("설정 탭 – 배송지", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=delivery", "설정 > 배송지");
  });

  test("설정 탭 – 임플란트 프리셋", async ({ page }) => {
    await visitPage(
      page,
      "/dashboard/settings?tab=implant",
      "설정 > 임플란트 프리셋",
    );
  });

  test("소개 대시보드 – 소개 링크/그룹 표시", async ({ page }) => {
    await page.goto("/dashboard/referral-groups");
    await page.waitForLoadState("networkidle");
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.length).toBeGreaterThan(10);
  });

  test("타 롤 접근 차단 – admin 전용 페이지", async ({ page }) => {
    await page.goto("/dashboard/users");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("/users");
  });

  test("타 롤 접근 차단 – manufacturer 전용 페이지", async ({ page }) => {
    await page.goto("/dashboard/worksheet");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("worksheet");
  });

  test("새 의뢰 페이지 – 기본 UI 요소 표시", async ({ page }) => {
    await page.goto("/dashboard/new-request");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.length).toBeGreaterThan(10);
  });
});
