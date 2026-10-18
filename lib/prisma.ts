import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

function getDatabaseUrl(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === "production") {
    const tmpDb = "/tmp/dev.db";
    if (!fs.existsSync(tmpDb)) {
      const seedCandidates = [
        path.join(process.cwd(), "prisma", "demo-seed.db"),
        path.join(process.cwd(), "prisma", "dev.db"),
      ];
      for (const seed of seedCandidates) {
        try {
          if (fs.existsSync(seed)) {
            fs.copyFileSync(seed, tmpDb);
            break;
          }
        } catch {
          // continue
        }
      }
    }
    const url = `file:${tmpDb}`;
    process.env["DATABASE_URL"] = url;
    return url;
  }
  const localUrl = process.env["DATABASE_URL"] || "file:./dev.db";
  process.env["DATABASE_URL"] = localUrl;
  return localUrl;
}

const dbUrl = getDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
