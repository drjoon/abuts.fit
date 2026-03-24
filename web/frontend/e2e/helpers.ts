import { Page, expect } from "@playwright/test";

export const ACCOUNTS = {
  devops: {
    email: "devops.owner@demo.abuts.fit",
    password: "Do!6vP#9xS@4nZ1!",
    role: "devops",
    name: "데모 개발운영사 대표",
    phone: "01011112222",
  },
  admin: {
    email: "admin.owner@demo.abuts.fit",
    password: "Ao!6fN#9rV@4cH2!",
    role: "admin",
    name: "데모 관리자 대표",
    phone: "01011113333",
  },
  salesman: {
    email: "salesman.owner@demo.abuts.fit",
    password: "So!8qL#3mV@6pK2!",
    role: "salesman",
    name: "데모 영업자 대표",
    phone: "01011114444",
  },
  requestor: {
    email: "requestor.owner@demo.abuts.fit",
    password: "Rq!8zY#4fQ@7nC5!",
    role: "requestor",
    name: "데모 의뢰자 대표",
    phone: "01011115555",
  },
  manufacturer: {
    email: "manufacturer.owner@demo.abuts.fit",
    password: "Mo!7vL#6pR@3sB8!",
    role: "manufacturer",
    name: "데모 제조사 대표",
    phone: "01011116666",
  },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

/**
 * Fast API-based login: calls /api/auth/login directly, stores token/user in
 * localStorage, then marks onboardingWizardCompleted and navigates to /dashboard.
 * Much faster than UI login and avoids the two-step email → password form.
 */
export async function loginAndSkipWizard(
  page: Page,
  account: (typeof ACCOUNTS)[AccountKey],
) {
  // Navigate to app first so we have a valid origin for fetch + localStorage
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  const result = await page.evaluate(
    async ({ email, password }) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!json?.success)
          return { ok: false, message: json?.message ?? "login failed" };
        const { token, refreshToken, user } = json.data ?? {};
        if (!token) return { ok: false, message: "no token" };

        localStorage.setItem("abuts_auth_token", token);
        if (refreshToken)
          localStorage.setItem("abuts_auth_refresh_token", refreshToken);
        if (user) localStorage.setItem("abuts_auth_user", JSON.stringify(user));

        // Mark wizard complete in DB
        await fetch("/api/users/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ onboardingWizardCompleted: true }),
        });

        // Patch stored user so React state reads wizard as completed on next load
        try {
          const stored = localStorage.getItem("abuts_auth_user");
          if (stored) {
            const u = JSON.parse(stored);
            u.onboardingWizardCompleted = true;
            u.businessVerified = u.businessVerified ?? false;
            localStorage.setItem("abuts_auth_user", JSON.stringify(u));
          }
        } catch {}

        return { ok: true, token };
      } catch (e: any) {
        return { ok: false, message: String(e?.message ?? e) };
      }
    },
    { email: account.email, password: account.password },
  );

  expect(
    result.ok,
    `Login failed for ${account.email}: ${(result as any).message}`,
  ).toBe(true);

  await page.goto("/dashboard");
  await page.waitForURL("/dashboard", { timeout: 20_000 });
}

/**
 * Two-step UI login (email → password) – does NOT skip wizard.
 * Used for wizard flow tests.
 */
export async function loginOnly(
  page: Page,
  account: (typeof ACCOUNTS)[AccountKey],
) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  // Step 1: fill email and click the submit button (shows password field)
  await page.fill("#email", account.email);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(300);

  // Step 2: fill password and submit
  await page.fill("#password", account.password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/(dashboard|wizard)/, { timeout: 20_000 });
}

/** Navigate to a page and assert no hard errors (no 500/404 text, page not blank) */
export async function visitPage(page: Page, path: string, label: string) {
  const response = await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);

  const status = response?.status() ?? 200;
  expect(status, `${label}: HTTP ${status}`).toBeLessThan(500);

  const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
  expect(bodyText.length, `${label}: page body is blank`).toBeGreaterThan(10);
}

/** Intercept business registration APIs with mock success responses */
export async function mockBusinessApis(page: Page) {
  await page.route("**/api/files/temp/presign", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        presignedUrl: "http://localhost/__mock_s3_upload__",
        key: "mock/business-license-test.jpg",
        _id: "mock-file-id-000001",
        fileId: "mock-file-id-000001",
        originalName: "business-license.jpg",
      }),
    });
  });

  await page.route("**/__mock_s3_upload__**", async (route) => {
    await route.fulfill({ status: 200, body: "" });
  });

  await page.route("**/api/ai/parse-business-license", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          extracted: {
            companyName: "테스트 주식회사",
            businessNumber: "123-45-67890",
            representativeName: "홍길동",
            address: "서울특별시 강남구 테헤란로 123",
            addressDetail: "4층",
            zipCode: "06130",
            phone: "02-1234-5678",
            email: "tax@test-company.co.kr",
            businessType: "서비스업",
            businessItem: "소프트웨어 개발 및 공급",
            startDate: "20200101",
          },
          verification: { verified: false, provider: "mock" },
        },
      }),
    });
  });

  await page.route("**/api/businesses/check-business-number", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/api/businesses/me", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            verification: {
              verified: true,
              provider: "mock",
              message: "Mock verification success",
            },
            welcomeBonusGranted: false,
            welcomeBonusAmount: 0,
          },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Complete wizard: profile → phone → role(owner) → business(mocked) */
export async function completeWizardWithMocks(
  page: Page,
  account: (typeof ACCOUNTS)[AccountKey],
) {
  // Reset wizard flag in DB so the wizard is triggered on login
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      const token = json?.data?.token;
      if (token) {
        await fetch("/api/users/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ onboardingWizardCompleted: false }),
        });
      }
    },
    { email: account.email, password: account.password },
  );

  await mockBusinessApis(page);
  await loginOnly(page, account);
  await page.waitForURL(/wizard/, { timeout: 15_000 });

  // ── Step: Profile ──────────────────────────────────────────────
  await page
    .waitForSelector('input[name="name"], input[placeholder*="이름"]', {
      timeout: 10_000,
    })
    .catch(() => {});
  const nameInput = page
    .locator('input[name="name"], input[placeholder*="이름"]')
    .first();
  if (await nameInput.isVisible()) {
    await nameInput.fill(account.name);
  }
  await clickNext(page);

  // ── Step: Phone ────────────────────────────────────────────────
  await page.waitForTimeout(600);
  const phoneInput = page
    .locator(
      'input[name="phoneNumber"], input[placeholder*="전화"], input[type="tel"]',
    )
    .first();
  if (await phoneInput.isVisible()) {
    const raw = account.phone.replace(/\D/g, "");
    const formatted = `+82${raw.replace(/^0/, "")}`;
    await phoneInput.fill(formatted);
    const sendBtn = page
      .locator(
        'button:has-text("인증번호"), button:has-text("발송"), button:has-text("전송")',
      )
      .first();
    if (await sendBtn.isVisible()) {
      await sendBtn.click();
      await page.waitForTimeout(1000);
    }
    const codeInput = page
      .locator('input[name="code"], input[placeholder*="인증번호"]')
      .first();
    if (await codeInput.isVisible()) {
      await codeInput.fill("1234");
      const verifyBtn = page
        .locator(
          'button:has-text("확인"), button:has-text("인증"), button:has-text("검증")',
        )
        .first();
      if (await verifyBtn.isVisible()) await verifyBtn.click();
      await page.waitForTimeout(800);
    }
  }
  await clickNext(page);

  // ── Step: Role ─────────────────────────────────────────────────
  await page.waitForTimeout(600);
  const ownerBtn = page
    .locator(
      'button:has-text("대표"), label:has-text("대표"), [data-value="owner"]',
    )
    .first();
  if (await ownerBtn.isVisible()) await ownerBtn.click();
  await clickNext(page);

  // ── Step: Business ─────────────────────────────────────────────
  await page.waitForTimeout(1000);

  // Upload a fake file to trigger license flow
  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles({
      name: "business-license.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-image-data"),
    });
    await page.waitForTimeout(4000);
  }

  // Click save button
  const saveBtn = page
    .locator(
      'button:has-text("저장"), button:has-text("등록"), button:has-text("완료")',
    )
    .first();
  if (await saveBtn.isVisible()) {
    await saveBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.waitForURL("/dashboard", { timeout: 20_000 }).catch(() => {});
}

async function clickNext(page: Page) {
  const nextBtn = page
    .locator(
      'button:has-text("다음"), button:has-text("Next"), button[type="submit"]:has-text("다음")',
    )
    .first();
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
  }
  await page.waitForTimeout(400);
}
