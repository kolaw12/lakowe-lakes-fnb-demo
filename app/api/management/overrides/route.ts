import { NextRequest, NextResponse } from "next/server";
import { AuditReportInputError, getOverrideReport } from "@/lib/audit-reporting";
import { ManagementAccessError, requireManagementAccess } from "@/lib/management-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const query = request.nextUrl.searchParams;
    const report = await getOverrideReport({
      from: query.get("from"), to: query.get("to"), employee: query.get("employee"), supervisor: query.get("supervisor"),
      status: query.get("status"), requestedAction: query.get("action"), outlet: query.get("outlet"),
      reference: query.get("reference"), page: query.get("page"), pageSize: query.get("pageSize"),
    });
    return NextResponse.json({ access: { id: user.id, name: user.name, role: user.role, mode: "demo" }, report });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AuditReportInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Supervisor override report failed", error);
    return NextResponse.json({ error: "Supervisor override reporting is unavailable." }, { status: 500 });
  }
}
