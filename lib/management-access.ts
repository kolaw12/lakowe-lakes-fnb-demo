import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export class ManagementAccessError extends Error {
  constructor(message: string, readonly status: 401 | 403) { super(message); }
}

export async function requireManagementAccess(request: NextRequest) {
  const actorId = request.headers.get("x-demo-user-id")?.trim() || request.cookies.get("lakowe-demo-staff-id")?.value?.trim();
  if (!actorId) throw new ManagementAccessError("A demo management identity is required.", 401);
  const user = await prisma.demoUser.findUnique({ where: { id: actorId }, select: { id: true, name: true, role: true } });
  if (!user) throw new ManagementAccessError("A valid demo management identity is required.", 401);
  if (user.role !== "supervisor") throw new ManagementAccessError("Supervisor access is required for management reporting.", 403);
  return user;
}
