import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

function initDatabaseUrl() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.startsWith("file:./"))) {
    const tmpDb = "/tmp/dev.db";
    const seedCandidates = [
      path.join(process.cwd(), "prisma", "demo-seed.db"),
      path.join(process.cwd(), "prisma", "dev.db"),
    ];
    if (!fs.existsSync(tmpDb)) {
      for (const seed of seedCandidates) {
        try {
          if (fs.existsSync(seed)) {
            fs.copyFileSync(seed, tmpDb);
            break;
          }
        } catch {
          // ignore error and try next
        }
      }
    }
    process.env.DATABASE_URL = `file:${tmpDb}`;
  } else if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "file:./dev.db";
  }
}

initDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
