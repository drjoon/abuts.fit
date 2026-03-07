import User from "../../../models/user.model.js";
import {
  NOW,
  attachUserToOrganization,
  findOrCreateOrganization,
  findOrCreateUser,
  pick,
  randInt,
  randomReferralCode,
} from "./utils.js";

export async function seedDefaultAccounts() {
  const passwords = {
    requestorOwner: "Rq!8zY#4fQ@7nC5$",
    requestorStaff: "Rs!9xT#5gA@6mD4$",
    manufacturerOwner: "Mo!7vL#6pR@3sB8$",
    manufacturerStaff: "Ms!5kP#8wQ@2nZ7$",
    adminOwner: "Ao!6fN#9rV@4cH2$",
    adminStaff: "As!4mJ#7tK@9pW3$",
    salesmanOwner: "So!8qL#3mV@6pK2$",
    salesmanStaff: "Ss!7wN#4cX@5rT1$",
  };

  const requestorOwner = await findOrCreateUser({
    name: "데모 의뢰자 대표",
    email: "requestor.owner@demo.abuts.fit",
    password: passwords.requestorOwner,
    role: "requestor",
    requestorRole: "owner",
    phoneNumber: "01000000001",
    organization: "데모기공소",
    referralCode: "seed_requestor_owner",
    approvedAt: NOW,
    active: true,
  });

  const requestorStaff = await findOrCreateUser({
    name: "데모 의뢰자 직원",
    email: "requestor.staff@demo.abuts.fit",
    password: passwords.requestorStaff,
    role: "requestor",
    requestorRole: "staff",
    phoneNumber: "01000000002",
    organization: "데모기공소",
    referralCode: "seed_requestor_staff",
    approvedAt: NOW,
    active: true,
    referredByUserId: requestorOwner._id,
    referralGroupLeaderId: requestorOwner._id,
  });

  const requestorOrg = await findOrCreateOrganization({
    organizationType: "requestor",
    name: "데모기공소",
    ownerId: requestorOwner._id,
    memberIds: [requestorStaff._id],
    extracted: {
      companyName: "데모기공소",
      representativeName: "데모 의뢰자 대표",
      businessNumber: "111-11-11111",
      phoneNumber: "02-0000-0001",
      email: "requestor.owner@demo.abuts.fit",
      address: "서울특별시 중구 세종대로 1",
    },
  });
  await attachUserToOrganization(requestorOwner._id, requestorOrg);
  await attachUserToOrganization(requestorStaff._id, requestorOrg);

  const manufacturerOwner = await findOrCreateUser({
    name: "데모 제조사 대표",
    email: "manufacturer.owner@demo.abuts.fit",
    password: passwords.manufacturerOwner,
    role: "manufacturer",
    manufacturerRole: "owner",
    phoneNumber: "01000000003",
    organization: "애크로덴트",
    referralCode: "seed_manufacturer_owner",
    approvedAt: NOW,
    active: true,
  });

  const manufacturerStaff = await findOrCreateUser({
    name: "데모 제조사 직원",
    email: "manufacturer.staff@demo.abuts.fit",
    password: passwords.manufacturerStaff,
    role: "manufacturer",
    manufacturerRole: "staff",
    phoneNumber: "01000000005",
    organization: "애크로덴트",
    referralCode: "seed_manufacturer_staff",
    approvedAt: NOW,
    active: true,
  });

  const manufacturerOrg = await findOrCreateOrganization({
    organizationType: "manufacturer",
    name: "애크로덴트",
    ownerId: manufacturerOwner._id,
    memberIds: [manufacturerStaff._id],
    extracted: {
      companyName: "애크로덴트",
      representativeName: "데모 제조사 대표",
      businessNumber: "222-22-22222",
      phoneNumber: "031-000-0003",
      email: "manufacturer.owner@demo.abuts.fit",
      address: "경기도 성남시 분당구 판교역로 1",
    },
  });
  await attachUserToOrganization(manufacturerOwner._id, manufacturerOrg);
  await attachUserToOrganization(manufacturerStaff._id, manufacturerOrg);

  const adminOwner = await findOrCreateUser({
    name: "데모 관리자 대표",
    email: "admin.owner@demo.abuts.fit",
    password: passwords.adminOwner,
    role: "admin",
    adminRole: "owner",
    phoneNumber: "01000000004",
    organization: "어벗츠핏",
    referralCode: "seed_admin_owner",
    approvedAt: NOW,
    active: true,
  });

  const adminStaff = await findOrCreateUser({
    name: "데모 관리자 직원",
    email: "admin.staff@demo.abuts.fit",
    password: passwords.adminStaff,
    role: "admin",
    adminRole: "staff",
    phoneNumber: "01000000006",
    organization: "어벗츠핏",
    referralCode: "seed_admin_staff",
    approvedAt: NOW,
    active: true,
  });

  const adminOrg = await findOrCreateOrganization({
    organizationType: "requestor",
    name: "어벗츠핏",
    ownerId: adminOwner._id,
    memberIds: [adminStaff._id],
    extracted: {
      companyName: "어벗츠핏",
      representativeName: "데모 관리자 대표",
      businessNumber: "333-33-33333",
      phoneNumber: "02-0000-0004",
      email: "admin.owner@demo.abuts.fit",
      address: "서울특별시 강남구 테헤란로 1",
    },
  });
  await attachUserToOrganization(adminOwner._id, adminOrg);
  await attachUserToOrganization(adminStaff._id, adminOrg);

  const salesmanOwner = await findOrCreateUser({
    name: "데모 영업자 대표",
    email: "salesman.owner@demo.abuts.fit",
    password: passwords.salesmanOwner,
    role: "salesman",
    phoneNumber: "01000000007",
    organization: "데모영업팀",
    referralCode: "seed_salesman_owner",
    approvedAt: NOW,
    active: true,
  });

  const salesmanStaff = await findOrCreateUser({
    name: "데모 영업자 직원",
    email: "salesman.staff@demo.abuts.fit",
    password: passwords.salesmanStaff,
    role: "salesman",
    phoneNumber: "01000000008",
    organization: "데모영업팀",
    referralCode: "seed_salesman_staff",
    approvedAt: NOW,
    active: true,
    referredByUserId: salesmanOwner._id,
    referralGroupLeaderId: salesmanOwner._id,
  });

  const salesmanOrg = await findOrCreateOrganization({
    organizationType: "salesman",
    name: "데모영업팀",
    ownerId: salesmanOwner._id,
    memberIds: [salesmanStaff._id],
    extracted: {
      companyName: "데모영업팀",
      representativeName: "데모 영업자 대표",
      businessNumber: "444-44-44444",
      phoneNumber: "02-0000-0007",
      email: "salesman.owner@demo.abuts.fit",
      address: "서울특별시 영등포구 여의대로 1",
    },
  });
  await attachUserToOrganization(salesmanOwner._id, salesmanOrg);
  await attachUserToOrganization(salesmanStaff._id, salesmanOrg);

  return {
    passwords,
    users: {
      requestorOwner,
      requestorStaff,
      manufacturerOwner,
      manufacturerStaff,
      adminOwner,
      adminStaff,
      salesmanOwner,
      salesmanStaff,
    },
  };
}

export async function seedBulkAccounts({
  requestorCount = 0,
  salesmanCount = 0,
  password = "Abc!1234",
} = {}) {
  const createdSalesmen = [];
  const salesmanRoots = [];
  const rootCount = Math.min(3, salesmanCount);

  for (let i = 1; i <= salesmanCount; i += 1) {
    const email = `s${String(i).padStart(3, "0")}@gmail.com`;
    const existing = await User.findOne({ email });
    if (existing) {
      const savedExisting = {
        id: existing._id,
        email,
        leaderId: existing.referralGroupLeaderId || existing._id,
        parentId: existing.referredByUserId || null,
      };
      createdSalesmen.push(savedExisting);
      if (i <= rootCount) salesmanRoots.push({ id: existing._id, email });
      continue;
    }

    let referredByUserId = null;
    let referralGroupLeaderId = null;
    const isRoot = i <= rootCount;
    const isUnreferred = !isRoot && i !== 4 && Math.random() < 0.2;

    if (!isRoot && !isUnreferred) {
      const root = salesmanRoots.length ? pick(salesmanRoots) : null;
      const candidates = createdSalesmen.filter(
        (s) => String(s.leaderId) === String(root?.id),
      );
      const pool = candidates.length ? candidates : createdSalesmen;
      const parent = pool.length ? pick(pool) : null;
      referredByUserId = parent?.id || null;
      referralGroupLeaderId =
        root?.id || parent?.leaderId || parent?.id || null;
    }

    const salesman = await User.create({
      name: `데모 영업자${i}`,
      email,
      password,
      role: "salesman",
      referralCode: randomReferralCode(4),
      referredByUserId,
      referralGroupLeaderId,
      approvedAt: NOW,
      active: true,
    });

    const leaderId = referralGroupLeaderId || salesman._id;
    const saved = {
      id: salesman._id,
      email,
      leaderId,
      parentId: referredByUserId,
    };
    createdSalesmen.push(saved);
    if (i <= rootCount) salesmanRoots.push({ id: salesman._id, email });
  }

  const salesIntroParents = [
    "s001@gmail.com",
    "s001@gmail.com",
    "s004@gmail.com",
    "s004@gmail.com",
    "s006@gmail.com",
    "s006@gmail.com",
    "s009@gmail.com",
    "s009@gmail.com",
  ];
  const requestorIntroParents = [
    "r001@gmail.com",
    "r002@gmail.com",
    "r003@gmail.com",
    "r004@gmail.com",
    "r001@gmail.com",
    "r002@gmail.com",
    "r003@gmail.com",
    "r004@gmail.com",
  ];
  const createdRequestors = [];

  for (let i = 1; i <= requestorCount; i += 1) {
    const email = `r${String(i).padStart(3, "0")}@gmail.com`;
    const orgName = `org-${String(i).padStart(3, "0")}`;
    const existing = await User.findOne({ email });
    if (existing) {
      createdRequestors.push({
        id: existing._id,
        email,
        orgId: existing.organizationId,
        leaderId: existing.referralGroupLeaderId || existing._id,
      });
      continue;
    }

    let parentId = null;
    let referralGroupLeaderId = null;
    if (i <= salesIntroParents.length) {
      const parentEmail = salesIntroParents[i - 1];
      const parentSalesman = createdSalesmen.find((s) => s.email === parentEmail);
      if (parentSalesman) {
        parentId = parentSalesman.id;
        referralGroupLeaderId = parentSalesman.leaderId || parentSalesman.id;
      }
    } else if (i <= salesIntroParents.length + requestorIntroParents.length) {
      const parentEmail =
        requestorIntroParents[i - salesIntroParents.length - 1];
      const parentRequestor = createdRequestors.find((r) => r.email === parentEmail);
      if (parentRequestor) {
        parentId = parentRequestor.id;
        referralGroupLeaderId = parentRequestor.leaderId || parentRequestor.id;
      }
    }

    const approvedAt = new Date(NOW);
    approvedAt.setDate(approvedAt.getDate() - randInt(0, 20));

    const owner = await User.create({
      name: `의뢰자 ${i}`,
      email,
      password,
      role: "requestor",
      requestorRole: "owner",
      organization: orgName,
      referralCode: randomReferralCode(),
      referredByUserId: parentId,
      referralGroupLeaderId,
      approvedAt,
      active: true,
    });

    const org = await findOrCreateOrganization({
      organizationType: "requestor",
      name: orgName,
      ownerId: owner._id,
      extracted: {
        companyName: orgName,
        representativeName: `의뢰자 ${i}`,
        email,
      },
    });

    const effectiveLeaderId = referralGroupLeaderId || parentId || owner._id;
    await User.updateOne(
      { _id: owner._id },
      {
        $set: {
          organizationId: org._id,
          organization: org.name,
          referralGroupLeaderId: effectiveLeaderId,
        },
      },
    );

    createdRequestors.push({
      id: owner._id,
      email,
      orgId: org._id,
      leaderId: effectiveLeaderId,
    });
  }

  return {
    requestors: createdRequestors,
    salesmen: createdSalesmen,
  };
}
