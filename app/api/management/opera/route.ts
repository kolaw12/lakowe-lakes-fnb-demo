import { NextRequest, NextResponse } from "next/server";
import { ManagementAccessError, requireManagementAccess } from "@/lib/management-access";
import { getOperaMonitoringReport, OperaMonitoringInputError } from "@/lib/opera-monitoring";
import { reconcileOperaAttempt } from "@/lib/opera-room-charge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const query = request.nextUrl.searchParams;
    const report = await getOperaMonitoringReport({
      from: query.get("from"), to: query.get("to"), postingStatus: query.get("postingStatus"),
      verificationStatus: query.get("verificationStatus"), reconciliationState: query.get("reconciliationState"),
      outlet: query.get("outlet"), reference: query.get("reference"), page: query.get("page"), pageSize: query.get("pageSize"),
    });
    return NextResponse.json({ access: { ...user, mode: "demo" }, report });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof OperaMonitoringInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("OPERA demo monitoring failed", error);
    return NextResponse.json({ error: "OPERA demo monitoring is unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body) || body.action !== "reconcile" || !("attemptId" in body) || typeof body.attemptId !== "string" || body.attemptId.length > 100) throw new OperaMonitoringInputError("Invalid reconciliation request.");
    const result = await reconcileOperaAttempt(body.attemptId, { id: user.id, role: user.role });
    return NextResponse.json({ result, report: await getOperaMonitoringReport() });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof OperaMonitoringInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulated reconciliation failed." }, { status: 400 });
  }
}
