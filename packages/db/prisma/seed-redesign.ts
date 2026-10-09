import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import { PROJECT_MILESTONES, STAGE_MILESTONES_DONE } from "../../shared/src/index";

type Ctx = {
  storageRoot: string;
  days: (offset: number) => Date;
  customers: { apex: string; westline: string; northstar: string };
  users: { md: string; executive: string; engineer: string; siteEngineer: string };
  variants: { rail: string; clamp: string; rod: string; connector: string };
  datasheetKey: string;
};

const COVERS: Array<[string, string, string]> = [
  ["#1f2a44", "#3b5b8c", "#f26b1d"],
  ["#20323a", "#4f7d8a", "#f5b041"],
  ["#2b2140", "#6b5b95", "#f26b1d"],
  ["#1d3328", "#3f7d5c", "#f5b041"],
  ["#3a2a1f", "#8c5b3b", "#f26b1d"],
  ["#1e2b38", "#5d7896", "#e74c3c"],
  ["#262626", "#6b7280", "#f26b1d"],
  ["#13324a", "#2e86c1", "#f5b041"],
];

function coverSvg(seed: number) {
  const [dark, mid, accent] = COVERS[seed % COVERS.length];
  const towers = Array.from({ length: 7 }, (_, index) => {
    const width = 26 + ((seed * 7 + index * 13) % 22);
    const height = 70 + ((seed * 11 + index * 29) % 120);
    const x = 8 + index * 44;
    const windows = Array.from({ length: Math.floor(height / 18) }, (_, row) => `<rect x="${x + 5}" y="${232 - height + 8 + row * 18}" width="${width - 10}" height="6" fill="#ffffff" opacity="${0.08 + ((row + index) % 3) * 0.06}"/>`).join("");
    return `<rect x="${x}" y="${240 - height}" width="${width}" height="${height}" fill="${index % 2 ? dark : mid}" opacity="0.92"/>${windows}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="320" height="240" fill="url(#sky)"/><circle cx="${240 - (seed % 4) * 30}" cy="58" r="22" fill="${accent}" opacity="0.85"/>${towers}<rect y="232" width="320" height="8" fill="${dark}"/><path d="M0 214 L320 196" stroke="${accent}" stroke-width="3" opacity="0.7"/></svg>`;
}

async function syncMilestones(prisma: PrismaClient, project: { id: string; stage: string; startDate: Date | null; expectedCompletion: Date | null }) {
  await prisma.projectMilestone.deleteMany({ where: { projectId: project.id } });
  const done = STAGE_MILESTONES_DONE[project.stage] ?? 0;
  const start = project.startDate;
  const end = project.expectedCompletion;
  await prisma.projectMilestone.createMany({
    data: PROJECT_MILESTONES.map((template, index) => {
      const planned = start && end && end > start ? new Date(start.getTime() + (end.getTime() - start.getTime()) * template.at) : null;
      return {
        projectId: project.id,
        key: template.key,
        label: template.label,
        sortOrder: index,
        plannedDate: planned,
        actualDate: index < done ? planned : null,
        status: index < done ? "DONE" : index === done ? "IN_PROGRESS" : "PENDING",
      };
    }),
  });
}

export async function seedRedesign(prisma: PrismaClient, ctx: Ctx) {
  const { days } = ctx;
  const coverDir = path.join(ctx.storageRoot, "media", "projects");
  mkdirSync(coverDir, { recursive: true });

  const extraProjects = [
    { code: "PRJ-0102", name: "Tech Park Phase 2", location: "Bengaluru, KA", stage: "QUOTED", value: 145000000, fixotec: 3664000, start: -30, end: 120, probability: 55 },
    { code: "PRJ-0103", name: "Metro Line 3", location: "Mumbai, MH", stage: "IDENTIFIED", value: 820000000, fixotec: 11200000, start: -5, end: 300, probability: 25 },
    { code: "PRJ-0104", name: "Industrial Plant", location: "Chennai, TN", stage: "EXECUTION", value: 260000000, fixotec: 5488000, start: -120, end: 40, probability: 90 },
    { code: "PRJ-0105", name: "Commercial Tower", location: "Bengaluru, KA", stage: "EXECUTION", value: 190000000, fixotec: 4520000, start: -150, end: 20, probability: 90 },
    { code: "PRJ-0106", name: "IT SEZ Campus", location: "Hyderabad, TS", stage: "ENGINEERING", value: 120000000, fixotec: 3600000, start: -60, end: 30, probability: 60 },
    { code: "PRJ-0107", name: "Hospital Block B", location: "Pune, MH", stage: "NEGOTIATION", value: 98000000, fixotec: 2246000, start: -20, end: 140, probability: 65 },
  ];
  for (const item of extraProjects) {
    await prisma.project.upsert({
      where: { code: item.code },
      update: {},
      create: {
        code: item.code,
        name: item.name,
        location: item.location,
        customerId: ctx.customers.apex,
        consultantId: ctx.customers.northstar,
        projectValue: item.value,
        fixotecValue: item.fixotec,
        startDate: days(item.start),
        expectedCompletion: days(item.end),
        stage: item.stage,
        probability: item.probability,
        ownerId: ctx.users.executive,
      },
    });
  }

  const projects = await prisma.project.findMany({ orderBy: { code: "asc" } });
  for (const [index, project] of projects.entries()) {
    const key = `projects/${project.code.toLowerCase()}.svg`;
    writeFileSync(path.join(ctx.storageRoot, "media", key), coverSvg(index));
    await prisma.project.update({ where: { id: project.id }, data: { coverImageKey: key } });
    await syncMilestones(prisma, project);
  }

  const main = projects.find((project) => project.code === "PRJ-0100");
  const harbour = projects.find((project) => project.code === "PRJ-0101");
  if (!main || !harbour) return;

  await prisma.rfq.update({ where: { number: "RFQ-0100" }, data: { dueDate: days(0), priority: "HIGH" } });
  const extraRfqs = [
    { number: "RFQ-0101", projectId: harbour.id, status: "UNDER_REVIEW", application: "HVAC Support Systems", due: 1, priority: "MEDIUM" },
    { number: "RFQ-0102", projectId: projects.find((project) => project.code === "PRJ-0102")?.id, status: "RECEIVED", application: "Cable Containment", due: 3, priority: "MEDIUM" },
    { number: "RFQ-0103", projectId: projects.find((project) => project.code === "PRJ-0107")?.id, status: "QUOTED", application: "Plumbing Supports", due: -2, priority: "LOW" },
    { number: "RFQ-0104", projectId: projects.find((project) => project.code === "PRJ-0106")?.id, status: "ENGINEERING_REQUIRED", application: "Seismic Bracing", due: 2, priority: "URGENT" },
  ];
  for (const item of extraRfqs) {
    await prisma.rfq.upsert({
      where: { number: item.number },
      update: {},
      create: {
        number: item.number,
        customerId: ctx.customers.apex,
        projectId: item.projectId,
        status: item.status,
        application: item.application,
        dueDate: days(item.due),
        priority: item.priority,
        assigneeId: ctx.users.executive,
        items: {
          create: [
            { variantId: ctx.variants.rail, description: "FXR 41×41 mounting channel", qty: 2400, unit: "M", specification: "HDG" },
            { variantId: ctx.variants.clamp, description: "Heavy pipe clamp", qty: 1200, unit: "NOS" },
            { variantId: ctx.variants.rod, description: "Threaded rod M10", qty: 850, unit: "NOS" },
          ],
        },
      },
    });
  }

  const engineeringCount = await prisma.engineeringRequest.count({ where: { projectId: main.id } });
  if (!engineeringCount) {
    await prisma.engineeringRequest.create({
      data: { number: "ENG-0100", projectId: main.id, customerId: ctx.customers.apex, application: "Chilled water support", requiredSystem: "Trapeze with FXR channel", load: "180 kg/m", engineerId: ctx.users.engineer, dueDate: days(3), status: "CALCULATION" },
    }).catch(() => undefined);
  }

  const docs = [
    { title: "General Arrangement", category: "DRAWING", thumb: "media/fixotec/2023/03/SRS-Heavy-1536x1536.png", size: 2_400_000 },
    { title: "Technical Submittal", category: "SUBMITTAL", thumb: null, size: 1_800_000 },
    { title: "BIM Model", category: "BIM", thumb: "media/fixotec/2023/03/Clevis-Hanger-1536x1536.png", size: 45_000_000 },
    { title: "Site Photos", category: "OTHER", thumb: "media/fixotec/2023/03/Riser-Clamp-1536x1536.png", size: 8_200_000 },
    { title: "Trapeze Detail", category: "CAD", thumb: "media/fixotec/2023/03/Swivel-Hanger-1536x1536.png", size: 640_000 },
  ];
  for (const doc of docs) {
    const existing = await prisma.document.findFirst({ where: { title: doc.title, entityType: "project", entityId: main.id } });
    if (existing) continue;
    await prisma.document.create({
      data: {
        title: doc.title,
        category: doc.category,
        entityType: "project",
        entityId: main.id,
        audiences: ["CUSTOMER", "CONSULTANT"],
        createdById: ctx.users.engineer,
        versions: {
          create: {
            version: doc.category === "DRAWING" ? 3 : 1,
            status: doc.category === "DRAWING" ? "APPROVED" : "CLIENT_REVIEW",
            fileName: `${doc.title.replace(/\s+/g, "-")}.pdf`,
            mimeType: "application/pdf",
            sizeBytes: doc.size,
            storageKey: ctx.datasheetKey,
            thumbnailKey: doc.thumb,
            createdById: ctx.users.engineer,
          },
        },
      },
    });
  }

  const submittalDoc = await prisma.document.findFirst({ where: { title: "Technical Submittal", entityId: main.id } });
  await prisma.submittal.upsert({
    where: { number: "SUB-0100" },
    update: {},
    create: { number: "SUB-0100", projectId: main.id, title: "Chilled water support submittal", status: "CLIENT_REVIEW", selections: { variants: [ctx.variants.rail, ctx.variants.clamp] }, documentId: submittalDoc?.id },
  });

  const activity: Array<{ entityType: string; entityId: string; from: string | null; to: string; minutes: number; actor: string; comment?: string }> = [
    { entityType: "project", entityId: main.id, from: "RFQ", to: "ENGINEERING", minutes: 60 * 26, actor: ctx.users.executive },
    { entityType: "rfq", entityId: (await prisma.rfq.findUniqueOrThrow({ where: { number: "RFQ-0100" } })).id, from: "UNDER_REVIEW", to: "PRICING", minutes: 60 * 5, actor: ctx.users.executive },
    { entityType: "engineering", entityId: main.id, from: "DRAWING", to: "CLIENT_APPROVAL", minutes: 95, actor: ctx.users.engineer, comment: "Engineering drawing uploaded" },
    { entityType: "project", entityId: harbour.id, from: "ENGINEERING", to: "QUOTED", minutes: 40, actor: ctx.users.executive, comment: "Customer approved quotation" },
  ];
  const already = await prisma.workflowEvent.count({ where: { comment: "Engineering drawing uploaded" } });
  if (!already) {
    for (const item of activity) {
      await prisma.workflowEvent.create({
        data: { entityType: item.entityType, entityId: item.entityId, fromStatus: item.from, toStatus: item.to, actorId: item.actor, comment: item.comment, createdAt: new Date(Date.now() - item.minutes * 60_000) },
      });
    }
    await prisma.comment.create({ data: { entityType: "project", entityId: main.id, authorId: ctx.users.siteEngineer, body: "Roof gallery access confirmed for next week.", createdAt: new Date(Date.now() - 20 * 60_000) } });
  }
}
