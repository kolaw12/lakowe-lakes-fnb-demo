import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

function createClient() {
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  if (remoteUrl) {
    if (!remoteUrl.startsWith("libsql://") && !remoteUrl.startsWith("https://")) {
      throw new Error("TURSO_DATABASE_URL must point to a hosted libSQL database.");
    }
    if (!process.env.TURSO_AUTH_TOKEN) {
      throw new Error("TURSO_AUTH_TOKEN is required for the shared database.");
    }
    return new PrismaClient({
      adapter: new PrismaLibSQL({ url: remoteUrl, authToken: process.env.TURSO_AUTH_TOKEN }),
    });
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error("Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Serverless deployments cannot persist a local SQLite database.");
  }

  // Local development and persistent servers must use the configured database.
  // Never replace it with a per-instance copy of the seed database in /tmp.
  return new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL || "file:./dev.db" } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Lazy initialization allows builds without database credentials; actual database
// requests fail clearly when deployment configuration is missing.
function client() {
  return globalForPrisma.prisma ??= createClient();
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = client();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
