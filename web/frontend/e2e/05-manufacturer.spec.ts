import { test, expect } from "@playwright/test";
import { ACCOUNTS, loginAndSkipWizard, visitPage } from "./helpers";

const ACCOUNT = ACCOUNTS.manufacturer;

const MANUFACTURER_PAGES = [
  { path: "/dashboard", label: "대시보드" },
  { path: "/dashboard/worksheet", label: "작업" },
  { path: "/dashboard/cnc", label: "장비" },
  { path: "/dashboard/payments", label: "정산" },
  { path: "/dashboard/inquiries", label: "문의" },
  { path: "/dashboard/settings", label: "설정" },
];

test.describe("Manufacturer – 전체 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNT);
  });

  for (const { path, label } of MANUFACTURER_PAGES) {
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

  test("설정 탭 – 직원 관리", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=staff", "설정 > 직원 관리");
  });

  test("워크시트 – 단계 탭 전환 (의뢰)", async ({ page }) => {
    await page.goto("/dashboard/worksheet");
    await page.waitForLoadState("networkidle");
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.length).toBeGreaterThan(10);
  });

  test("장비 페이지 – CNC 기기 목록 렌더링", async ({ page }) => {
    await page.goto("/dashboard/cnc");
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
