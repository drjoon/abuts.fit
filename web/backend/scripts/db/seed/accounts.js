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
  const specs = [
    {
      name: "데모 의뢰자 대표",
      email: "requestor.owner@demo.abuts.fit",
      password: "Rq!8zY#4fQ@7nC5!",
      role: "requestor",
      phoneNumber: "01000000001",
    },
    {
      name: "데모 의뢰자 직원",
      email: "requestor.staff@demo.abuts.fit",
      password: "Rs!9xT#5gA@6mD4!",
      role: "requestor",
      phoneNumber: "01000000002",
    },
    {
      name: "데모 제조사 대표",
      email: "manufacturer.owner@demo.abuts.fit",
      password: "Mo!7vL#6pR@3sB8!",
      role: "manufacturer",
      phoneNumber: "01000000003",
    },
    {
      name: "데모 제조사 직원",
      email: "manufacturer.staff@demo.abuts.fit",
      password: "Ms!5kP#8wQ@2nZ7!",
      role: "manufacturer",
      phoneNumber: "01000000005",
    },
    {
      name: "데모 관리자 대표",
      email: "admin.owner@demo.abuts.fit",
      password: "Ao!6fN#9rV@4cH2!",
      role: "admin",
      phoneNumber: "01000000004",
    },
    {
      name: "데모 관리자 직원",
      email: "admin.staff@demo.abuts.fit",
      password: "As!4mJ#7tK@9pW3!",
      role: "admin",
      phoneNumber: "01000000006",
    },
    {
      name: "데모 영업자 대표",
      email: "salesman.owner@demo.abuts.fit",
      password: "So!8qL#3mV@6pK2!",
      role: "salesman",
      phoneNumber: "01000000007",
    },
    {
      name: "데모 영업자 직원",
      email: "salesman.staff@demo.abuts.fit",
      password: "Ss!7wN#4cX@5rT1!",
      role: "salesman",
      phoneNumber: "01000000008",
    },
    {
      name: "데모 개발운영사 대표",
      email: "devops.owner@demo.abuts.fit",
      password: "Do!6vP#9xS@4nZ1!",
      role: "devops",
      phoneNumber: "01000000009",
    },
    {
      name: "데모 개발운영사 직원",
      email: "devops.staff@demo.abuts.fit",
      password: "Ds!5mQ#7kV@3rB2!",
      role: "devops",
      phoneNumber: "01000000010",
    },
  ];

  for (const spec of specs) {
    await findOrCreateUser({
      name: spec.name,
      email: spec.email,
      password: spec.password,
      role: spec.role,
      phoneNumber: spec.phoneNumber,
      approvedAt: NOW,
      active: true,
    });
  }

  return { specs };
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
