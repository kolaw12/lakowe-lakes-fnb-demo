import { NextRequest, NextResponse } from "next/server";
import { ManagementAccessError, requireManagementAccess } from "@/lib/management-access";
import { prepareSageSync, reconcileSageSync, submitSageSync } from "@/lib/sage-accounting";
import { getSageMonitoringReport, SageMonitoringInputError } from "@/lib/sage-monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const query = request.nextUrl.searchParams;
    const report = await getSageMonitoringReport({
      from: query.get("from"), to: query.get("to"), outlet: query.get("outlet"),
      syncStatus: query.get("syncStatus"), paymentMethod: query.get("paymentMethod"),
      reference: query.get("reference"), page: query.get("page"), pageSize: query.get("pageSize"),
    });
    return NextResponse.json({ access: { ...user, mode: "demo" }, report });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SageMonitoringInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Sage demo monitoring failed", error);
    return NextResponse.json({ error: "Sage demo monitoring is unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string") throw new SageMonitoringInputError("Invalid Sage demo action.");
    const actor = { id: user.id, role: user.role };
    let result;
    if (body.action === "prepare") {
      if (!("transactionId" in body) || typeof body.transactionId !== "string" || !("scenario" in body) || typeof body.scenario !== "string") throw new SageMonitoringInputError("Select a valid transaction and DEMO scenario.");
      result = await prepareSageSync(body.transactionId, body.scenario, actor);
    } else if (body.action === "submit") {
      if (!("syncId" in body) || typeof body.syncId !== "string" || body.syncId.length > 100) throw new SageMonitoringInputError("Select a valid synchronization record.");
      result = await submitSageSync(body.syncId, actor);
    } else if (body.action === "reconcile") {
      if (!("syncId" in body) || typeof body.syncId !== "string" || body.syncId.length > 100) throw new SageMonitoringInputError("Select a valid synchronization record.");
      result = await reconcileSageSync(body.syncId, actor);
    } else throw new SageMonitoringInputError("Unsupported Sage demo action.");
    return NextResponse.json({ result, report: await getSageMonitoringReport() });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SageMonitoringInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sage demo action failed." }, { status: 400 });
  }
}
