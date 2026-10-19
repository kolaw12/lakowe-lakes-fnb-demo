import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const migrations = new URL("../prisma/migrations/", import.meta.url);

export async function migrate(client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS "_lakowe_migrations" (
    "name" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL,
    "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const name of (await readdir(migrations)).filter(name => /^\d+_/.test(name)).sort()) {
    const sql = await readFile(new URL(`${name}/migration.sql`, migrations), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const tx = await client.transaction("write");
    try {
      const existing = await tx.execute({ sql: 'SELECT checksum FROM "_lakowe_migrations" WHERE name = ?', args: [name] });
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      } else {
        await tx.executeMultiple(sql);
        await tx.execute({ sql: 'INSERT INTO "_lakowe_migrations" (name, checksum) VALUES (?, ?)', args: [name, checksum] });
        console.log(`Applied ${name}`);
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally { tx.close(); }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  // Load server-side Vercel variables or .env.local; never expose these to the browser.
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)));
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || !/^(libsql|https):\/\//.test(url) || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for the hosted database before migrating.");
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try { await migrate(client); } finally { client.close(); }
}
