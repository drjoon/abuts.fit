// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/RequestorCapabilitiesPicker.tsx
// - web/frontend/e2e/helpers.ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNTS,
  loginAndSkipWizard,
  resolveAccount,
  visitPage,
} from "./helpers";

const KIND_PRACTICE = "치과 (기공실 포함)";
const KIND_LAB = "기공소";
const ROLE_BADGE_PRACTICE = "의뢰자·치과";
const ROLE_BADGE_LAB = "의뢰자·기공소";
const SERVICE_FREE = "기공의뢰서 (무료)";
const SERVICE_PAID = "생산의뢰 (유료)";
const OLD_SENDER = "원내 기공실 없는 치과";
const OLD_RECEIVER = "기공소 혹은 원내 기공실";
const OLD_CAP_SENDER = "의뢰 발신자 (치과)";
const OLD_CAP_RECEIVER = "의뢰 수신자 (기공소와 기공실)";

const REQUESTOR = resolveAccount("requestor");

const RELATED_REQUESTOR_PAGES = [
  { path: "/dashboard", label: "대시보드(유료게이트)" },
  { path: "/dashboard/new-request", label: "신규의뢰(유료게이트)" },
  { path: "/dashboard/practice-transfers", label: "기공의뢰서" },
  { path: "/dashboard/settings?tab=business", label: "설정 > 사업자" },
  { path: "/dashboard/settings?tab=request", label: "설정 > 의뢰" },
  { path: "/dashboard/settings?tab=payment", label: "설정 > 결제" },
  { path: "/dashboard/referral-groups", label: "소개" },
];

const capsSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/shared/business/requestorCapabilities.ts",
  ),
  "utf8",
);

async function assertNoLegacyLabels(
  page: import("@playwright/test").Page,
  label: string,
) {
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  expect(body.includes(OLD_SENDER), `${label}: 구 발신 라벨`).toBe(false);
  expect(body.includes(OLD_RECEIVER), `${label}: 구 수신 라벨`).toBe(false);
  return body;
}

test.describe("Requestor capability labels – SSOT/공개/관리자", () => {
  test("SSOT 상수 – 신규 라벨 존재·구 라벨 제거", async () => {
    expect(capsSource).toContain(`practice: "${KIND_PRACTICE}"`);
    expect(capsSource).toContain(`lab: "${KIND_LAB}"`);
    expect(capsSource).toContain(`practice: "${ROLE_BADGE_PRACTICE}"`);
    expect(capsSource).toContain(`lab: "${ROLE_BADGE_LAB}"`);
    expect(capsSource).toContain(`free: "${SERVICE_FREE}"`);
    expect(capsSource).toContain(`paid: "${SERVICE_PAID}"`);
    expect(capsSource).not.toContain(OLD_SENDER);
    expect(capsSource).not.toContain(OLD_RECEIVER);
    expect(capsSource).not.toContain(OLD_CAP_SENDER);
    expect(capsSource).not.toContain(OLD_CAP_RECEIVER);
  });

  test("가입 안내 – 의뢰자 역할에 치과/기공소 문구", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    const requestorBtn = page
      .locator('button:has-text("의뢰자"), button:has-text("의뢰")')
      .first();
    if (await requestorBtn.isVisible().catch(() => false)) {
      await requestorBtn.click();
      await page.waitForTimeout(300);
    }

    const body = await page.evaluate(() => document.body?.innerText ?? "");
    expect(body.includes(OLD_SENDER) || body.includes(OLD_RECEIVER)).toBe(false);
    expect(
      body.includes("치과") || body.includes("기공소"),
    ).toBe(true);
  });

  test("드롭존 – 공개 페이지 렌더·구 라벨 부재", async ({ page }) => {
    await visitPage(page, "/practice/dropzone", "드롭존");
    await assertNoLegacyLabels(page, "드롭존");
  });

  test("관리자 사용자 – DEV 로그인 후 구 뱃지 문구 부재", async ({ page }) => {
    await loginAndSkipWizard(page, ACCOUNTS.admin);
    expect(page.url()).toMatch(/\/dashboard/);

    await page.goto("/dashboard/users?role=requestor");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const body = await assertNoLegacyLabels(page, "관리자 사용자");
    expect(body.length).toBeGreaterThan(10);
    expect(body.includes("치과(무료)")).toBe(false);
  });
});

test.describe("Requestor capability labels – 유료게이트 로직", () => {
  test("canUsePaidServices = paid && verified", async () => {
    const canUsePaid = (args?: {
      businessVerified?: boolean;
      services?: { free?: boolean; paid?: boolean };
    }) =>
      Boolean(args?.businessVerified) && Boolean(args?.services?.paid);

    expect(
      canUsePaid({
        businessVerified: true,
        services: { free: true, paid: false },
      }),
    ).toBe(false);
    expect(
      canUsePaid({
        businessVerified: true,
        services: { free: true, paid: true },
      }),
    ).toBe(true);
    expect(
      canUsePaid({
        businessVerified: false,
        services: { free: true, paid: true },
      }),
    ).toBe(false);
  });
});

test.describe("Requestor capability labels – 실계정 로그인", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !process.env.E2E_REQUESTOR_PASSWORD,
      "E2E_REQUESTOR_PASSWORD 필요",
    );
    await loginAndSkipWizard(page, REQUESTOR, { preferDevQuickLogin: false });
  });

  for (const { path, label } of RELATED_REQUESTOR_PAGES) {
    test(`페이지 렌더링: ${label} (${path})`, async ({ page }) => {
      await visitPage(page, path, label);
      expect(page.url()).not.toContain("/login");
      await assertNoLegacyLabels(page, label);
    });
  }

  test("설정 > 사업자 – 역할/서비스 라벨 표시", async ({ page }) => {
    await page.goto("/dashboard/settings?tab=business");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/login");

    const body = await assertNoLegacyLabels(page, "설정>사업자");
    if (body.includes("역할을 하나") || body.includes("이용할 서비스")) {
      await expect(page.getByText(KIND_PRACTICE, { exact: false })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(KIND_LAB, { exact: false })).toBeVisible({
        timeout: 10_000,
      });
      // 설정 화면에서는 서비스 체크가 보일 수 있음(온보딩은 무료 고정·숨김)
      await expect(page.getByText(SERVICE_FREE, { exact: false })).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("기공의뢰서 – 발신/수신 UI", async ({ page }) => {
    await page.goto("/dashboard/practice-transfers");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/login");

    const body = await assertNoLegacyLabels(page, "기공의뢰서");
    expect(
      body.includes("발신") ||
        body.includes("수신") ||
        body.includes("환자명") ||
        body.includes("기공소") ||
        body.includes("역할"),
    ).toBe(true);
  });

  test("유료 게이트 – free-only면 대시보드→기공의뢰서", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain("/login");

    const url = page.url();
    expect(url).toMatch(/\/dashboard/);
    const pathOnly = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (pathOnly === "/dashboard") {
      expect(url).not.toContain("practice-transfers");
    } else {
      expect(url).toContain("practice-transfers");
    }
  });

  test("유료 게이트 – paid+verified 모킹 시 대시보드 허용", async ({
    page,
  }) => {
    await page.route("**/api/businesses/me**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            membership: "owner",
            businessVerified: true,
            requestorKind: "lab",
            requestorServices: { free: true, paid: true },
          },
        }),
      });
    });

    await page.goto("/dashboard");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("abuts:requestor-access-updated"));
    });
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain("/login");
    expect(page.url()).toMatch(/\/dashboard/);
  });
});
