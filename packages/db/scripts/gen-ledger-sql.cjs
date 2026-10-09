// One-off generator for the ledger_core migration seed SQL (chart of accounts, permissions, role grants).
const shared = require("../../shared/dist/index.js");

const q = (value) => (value === undefined || value === null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);
const out = [];

out.push("-- Seed: default chart of accounts");
for (const account of shared.DEFAULT_CHART) {
  out.push(
    `INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES (${q(`acc_${account.code}`)}, ${q(account.code)}, ${q(account.name)}, ${q(account.type)}, ${q(account.subtype)}, ${q(account.systemKey)}, ${account.parent ? `(SELECT "id" FROM "Account" WHERE "code" = ${q(account.parent)})` : "NULL"}, ${account.group ? "true" : "false"}, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;`,
  );
}

const resources = process.argv.slice(2);
out.push("", `-- Seed: permissions for ${resources.join(", ")}`);
for (const resource of resources) {
  for (const action of shared.ACTIONS) {
    const key = `${resource}.${action}`;
    out.push(`INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES (${q(`perm_${resource}_${action}`)}, ${q(key)}, ${q(resource)}, ${q(action)}) ON CONFLICT DO NOTHING;`);
  }
}

out.push("", "-- Seed: role grants from the presets");
for (const [roleKey, preset] of Object.entries(shared.ROLE_PRESETS)) {
  const keys = preset.permissions === "*" ? resources.flatMap((resource) => shared.ACTIONS.map((action) => `${resource}.${action}`)) : preset.permissions.filter((key) => resources.includes(key.split(".")[0]));
  const extra = preset.permissions === "*" ? [] : preset.permissions.filter((key) => !resources.includes(key.split(".")[0]));
  const all = [...keys, ...extra];
  if (!keys.length) continue;
  out.push(
    `INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN (${all.map(q).join(", ")}) WHERE r."key" = ${q(roleKey)} ON CONFLICT DO NOTHING;`,
  );
}

process.stdout.write(out.join("\n") + "\n");
