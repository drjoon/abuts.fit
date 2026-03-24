import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  loginAndSkipWizard,
  completeWizardWithMocks,
  visitPage,
} from "./helpers";

const ACCOUNT = ACCOUNTS.devops;

const DEVOPS_PAGES = [
  { path: "/dashboard", label: "대시보드" },
  { path: "/dashboard/referral-groups", label: "소개" },
  { path: "/dashboard/payments", label: "정산" },
  { path: "/dashboard/inquiries", label: "문의" },
  { path: "/dashboard/settings", label: "설정" },
  { path: "/dashboard/settings/devops", label: "개발운영사 설정" },
];

test.describe("Devops – 온보딩 위저드", () => {
  test("온보딩 위저드 완료 (profile → phone → role → business mock)", async ({
    page,
  }) => {
    await completeWizardWithMocks(page, ACCOUNT);
    await expect(page).toHaveURL(/dashboard/, { timeout: 25_000 });
  });
});

test.describe("Devops – 전체 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNT);
  });

  for (const { path, label } of DEVOPS_PAGES) {
    test(`페이지 렌더링: ${label} (${path})`, async ({ page }) => {
      await visitPage(page, path, label);
    });
  }

  test("설정 탭 – 계정 정보", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=account", "설정 > 계정");
  });

  test("설정 탭 – 알림", async ({ page }) => {
    await visitPage(
      page,
      "/dashboard/settings?tab=notifications",
      "설정 > 알림",
    );
  });

  test("설정 탭 – 보안", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=security", "설정 > 보안");
  });

  test("설정 탭 – 사업자", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=business", "설정 > 사업자");
  });

  test("설정 탭 – 정산", async ({ page }) => {
    await visitPage(page, "/dashboard/settings?tab=payout", "설정 > 정산");
  });

  test("개발운영사 전용 설정 페이지", async ({ page }) => {
    await visitPage(page, "/dashboard/settings/devops", "개발운영사 설정");
  });

  test("타 롤 접근 차단 – requestor 전용 페이지", async ({ page }) => {
    await page.goto("/dashboard/new-request");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("new-request");
  });
});
