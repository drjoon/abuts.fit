import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { NOW, findOrCreateUser } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// $ 제외: .env 파일에서 변수 확장 문자로 해석되어 escape 처리가 필요해지므로 사용하지 않는다.
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#%^&*()-_=+";
const ESSENTIAL_ACCOUNTS_CONFIG_PATH = path.join(
  __dirname,
  ".essential-accounts.config.json",
);
const ESSENTIAL_ACCOUNTS_OUTPUT_PATH = path.join(
  __dirname,
  ".essential-accounts.json",
);
const BULK_ACCOUNTS_CONFIG_PATH = path.join(
  __dirname,
  ".bulk-accounts.config.json",
);

function generateSecurePassword(length = 18) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

async function readJsonConfig(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[seed] ${label} 파일(${filePath})을 읽을 수 없습니다: ${err.message}`,
    );
  }
}

async function readJsonConfigIfExists(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return null;
    }
    throw new Error(
      `[seed] ${label} 파일(${filePath})을 읽을 수 없습니다: ${err.message}`,
    );
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildExistingEssentialAccountMap(output) {
  const users = ensureArray(output?.users);
  const map = new Map();

  for (const user of users) {
    if (!user?.email) continue;
    map.set(user.email, user);
  }

  return map;
}

export async function seedEssentialAccounts() {
  const config = await readJsonConfig(
    ESSENTIAL_ACCOUNTS_CONFIG_PATH,
    "필수 계정 설정",
  );
  const existingOutput = await readJsonConfigIfExists(
    ESSENTIAL_ACCOUNTS_OUTPUT_PATH,
    "기존 필수 계정 결과",
  );
  const existingAccountMap = buildExistingEssentialAccountMap(existingOutput);
  const specs = ensureArray(config.accounts);
  const createdUsers = [];

  for (const spec of specs) {
    const existingAccount = existingAccountMap.get(spec.email);
    const password = existingAccount?.password || generateSecurePassword();
    await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password,
      role: spec.role,
      phoneNumber: spec.phoneNumber,
      approvedAt: NOW,
      active: true,
    });

    createdUsers.push({
      label: spec.label,
      name: spec.name,
      email: spec.email,
      phoneNumber: spec.phoneNumber,
      role: spec.role,
      password,
    });
  }

  return { users: createdUsers };
}

export async function seedDefaultAccounts() {
  const specs = [];
}

export async function seedBulkAccounts() {
  const config = await readJsonConfig(
    BULK_ACCOUNTS_CONFIG_PATH,
    "벌크 계정 설정",
  );
  const requestorSpecs = ensureArray(config.requestors);
  const salesmanSpecs = ensureArray(config.salesmen);

  const createdSalesmen = [];

  for (const spec of salesmanSpecs) {
    const password = generateSecurePassword();
    await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password,
      role: "salesman",
      phoneNumber: spec.phoneNumber,
      approvedAt: NOW,
      active: true,
    });
    createdSalesmen.push({
      email: spec.email,
      name: spec.name,
      label: spec.label,
      password,
    });
  }

  const createdRequestors = [];
  for (const spec of requestorSpecs) {
    const password = generateSecurePassword();
    await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password,
      role: "requestor",
      phoneNumber: spec.phoneNumber,
      approvedAt: NOW,
      active: true,
    });
    createdRequestors.push({
      email: spec.email,
      name: spec.name,
      label: spec.label,
      password,
    });
  }

  return {
    requestors: createdRequestors,
    salesmen: createdSalesmen,
  };
}
