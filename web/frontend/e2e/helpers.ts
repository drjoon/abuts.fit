// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

export type E2EAccount = {
  email: string;
  password: string;
  role: string;
  name: string;
  phone: string;
};

/** env 오버라이드(비밀번호는 코드에 넣지 않음) */
export const resolveAccount = (key: AccountKey): E2EAccount => {
  const base = ACCOUNTS[key];
  if (key === "requestor") {
    return {
      ...base,
      email: process.env.E2E_REQUESTOR_EMAIL || base.email,
      password: process.env.E2E_REQUESTOR_PASSWORD || base.password,
    };
  }
  if (key === "admin") {
    return {
      ...base,
      email: process.env.E2E_ADMIN_EMAIL || base.email,
      password: process.env.E2E_ADMIN_PASSWORD || base.password,
    };
  }
  return { ...base };
};

/** 로컬 DB에 데모 계정이 없을 때 쓰는 실계정(비밀번호 없이 JWT 민트) */
export const LOCAL_E2E_EMAILS = {
  requestor: process.env.E2E_REQUESTOR_EMAIL || "dr.joon@gmail.com",
  admin: process.env.E2E_ADMIN_EMAIL || "dr.joo.n@gmail.com",
} as const;


const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../backend",
);

type MintedSession = {
  ok: boolean;
  message?: string;
  token?: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
};

/** 비밀번호 없이 이메일로 JWT 세션 발급(로컬 E2E용) */
export function mintSessionByEmail(email: string): MintedSession {
  const script = `
import "./bootstrap/env.js";
import { connectDb, disconnectDb } from "./scripts/db/_mongo.js";
import User from "./models/user.model.js";
import { generateToken, generateRefreshToken } from "./utils/jwt.util.js";

const email = ${JSON.stringify(email)};
await connectDb();
const user = await User.findOne({ email }).select("-password").lean();
if (!user) {
  console.log(JSON.stringify({ ok: false, message: "user not found: " + email }));
  await disconnectDb();
  process.exit(0);
}
await User.updateOne(
  { _id: user._id },
  {
    $set: {
      onboardingWizardCompleted: true,
      approvedAt: user.approvedAt || new Date(),
    },
  },
);
const fresh = await User.findById(user._id).select("-password").lean();
const token = generateToken({ userId: fresh._id, role: fresh.role });
const refreshToken = generateRefreshToken(fresh._id);
console.log(JSON.stringify({
  ok: true,
  token,
  refreshToken,
  user: fresh,
}));
await disconnectDb();
`;

  const result = spawnSync(
    "node",
    ["--input-type=module"],
    {
      cwd: backendRoot,
      env: { ...process.env, ENV_FILE: "local.env" },
      input: script,
      encoding: "utf8",
      timeout: 60_000,
    },
  );

  if (result.status !== 0) {
    return {
      ok: false,
      message: String(result.stderr || result.stdout || "mint failed"),
    };
  }

  const lines = String(result.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
  if (!jsonLine) {
    return { ok: false, message: "no mint json output" };
  }
  try {
    return JSON.parse(jsonLine) as MintedSession;
  } catch {
    return { ok: false, message: "invalid mint json" };
  }
}

async function applySessionToPage(
  page: Page,
  session: { token: string; refreshToken?: string; user: Record<string, unknown> },
) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((payload) => {
    localStorage.setItem("abuts_auth_token", payload.token);
    if (payload.refreshToken) {
      localStorage.setItem("abuts_auth_refresh_token", payload.refreshToken);
    }
    const user = {
      ...payload.user,
      id: String(payload.user._id || payload.user.id || ""),
      onboardingWizardCompleted: true,
      businessVerified: Boolean(payload.user.businessVerified),
    };
    localStorage.setItem("abuts_auth_user", JSON.stringify(user));
  }, session);
}

/**
 * Fast login for local E2E.
 * 실계정 비밀번호가 있으면 UI 로그인(스토어 normalize 경로)을 우선한다.
 */
export async function loginAndSkipWizard(
  page: Page,
  account: E2EAccount | (typeof ACCOUNTS)[AccountKey],
  options?: { mintEmail?: string; preferDevQuickLogin?: boolean },
) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  const hasPasswordOverride =
    Boolean(process.env.E2E_REQUESTOR_PASSWORD) &&
    account.role === "requestor";
  const preferDevQuickLogin =
    options?.preferDevQuickLogin ?? !hasPasswordOverride;

  // 실계정: 이메일→비밀번호 UI 로그인 (useAuthStore.login + normalizeApiUser)
  if (hasPasswordOverride || options?.preferDevQuickLogin === false) {
    await page.fill("#email", account.email);
    await page.click('button[type="submit"]');
    await page.waitForSelector("#password", { timeout: 10_000 });
    await page.fill("#password", account.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|wizard)/, { timeout: 20_000 });

    if (page.url().includes("wizard")) {
      const token = await page.evaluate(() =>
        localStorage.getItem("abuts_auth_token"),
      );
      if (token) {
        await page.evaluate(async (t) => {
          await fetch("/api/users/profile", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${t}`,
            },
            body: JSON.stringify({ onboardingWizardCompleted: true }),
          });
          try {
            const raw = localStorage.getItem("abuts_auth_user");
            if (raw) {
              const u = JSON.parse(raw);
              u.onboardingWizardCompleted = true;
              localStorage.setItem("abuts_auth_user", JSON.stringify(u));
            }
          } catch {}
        }, token);
        await page.goto("/dashboard");
      }
    }

    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    // 세션 안정화: auth/me 재검증 후 로그인으로 튕기지 않았는지 확인
    await page.waitForTimeout(1200);
    expect(
      page.url(),
      `UI login session unstable for ${account.email}`,
    ).toMatch(/\/dashboard/);
    return;
  }

  if (preferDevQuickLogin) {
    const quick = page.getByRole("button", { name: /DEV QUICK LOGIN/i });
    if (await quick.isVisible().catch(() => false)) {
      await quick.click();
      await page.waitForTimeout(300);
      const roleHints =
        account.role === "admin"
          ? [/관리자/, /admin/i]
          : account.role === "requestor"
            ? [/의뢰/, /requestor/i, /치과/, /발신/]
            : [new RegExp(account.role, "i")];
      let clicked = false;
      for (const hint of roleHints) {
        const btn = page.getByRole("button", { name: hint }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        const byEmail = page
          .locator(`button:has-text("${account.email}")`)
          .first();
        if (await byEmail.isVisible().catch(() => false)) {
          await byEmail.click();
          clicked = true;
        }
      }
      if (clicked) {
        await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
        if (page.url().includes("wizard")) {
          const token = await page.evaluate(() =>
            localStorage.getItem("abuts_auth_token"),
          );
          if (token) {
            await page.evaluate(async (t) => {
              await fetch("/api/users/profile", {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${t}`,
                },
                body: JSON.stringify({ onboardingWizardCompleted: true }),
              });
              try {
                const raw = localStorage.getItem("abuts_auth_user");
                if (raw) {
                  const u = JSON.parse(raw);
                  u.onboardingWizardCompleted = true;
                  localStorage.setItem("abuts_auth_user", JSON.stringify(u));
                }
              } catch {}
            }, token);
            await page.goto("/dashboard");
            await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
          }
        }
        return;
      }
    }
  }

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
        if (!token || !user) return { ok: false, message: "no token/user" };

        // 스토어와 동일하게 id 정규화
        const normalized = {
          ...user,
          id: String(user._id || user.id || ""),
          onboardingWizardCompleted: true,
          businessVerified: Boolean(user.businessVerified),
        };

        localStorage.setItem("abuts_auth_token", token);
        if (refreshToken)
          localStorage.setItem("abuts_auth_refresh_token", refreshToken);
        localStorage.setItem("abuts_auth_user", JSON.stringify(normalized));

        await fetch("/api/users/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ onboardingWizardCompleted: true }),
        });

        return { ok: true, token };
      } catch (e: any) {
        return { ok: false, message: String(e?.message ?? e) };
      }
    },
    { email: account.email, password: account.password },
  );

  if (!result.ok) {
    if (hasPasswordOverride || options?.preferDevQuickLogin === false) {
      expect(
        result.ok,
        `Login failed for ${account.email}: ${(result as any).message}`,
      ).toBe(true);
    }

    const mintEmail =
      options?.mintEmail ||
      (account.role === "admin"
        ? LOCAL_E2E_EMAILS.admin
        : account.role === "requestor"
          ? LOCAL_E2E_EMAILS.requestor
          : "");
    expect(
      Boolean(mintEmail),
      `Login failed for ${account.email}: ${(result as any).message}`,
    ).toBe(true);
    const minted = mintSessionByEmail(String(mintEmail));
    expect(
      minted.ok && minted.token && minted.user,
      `Mint login failed for ${mintEmail}: ${minted.message}`,
    ).toBeTruthy();
    await applySessionToPage(page, {
      token: String(minted.token),
      refreshToken: minted.refreshToken,
      user: minted.user as Record<string, unknown>,
    });
  }

  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  expect(page.url()).toMatch(/\/dashboard/);
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
