import { NextRequest, NextResponse } from "next/server";
import { ManagementAccessError, requireManagementAccess } from "@/lib/management-access";
import { getManagementReport, ManagementReportInputError } from "@/lib/management-reporting";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireManagementAccess(request);
    const search = request.nextUrl.searchParams;
    const report = await getManagementReport({ from: search.get("from"), to: search.get("to"), outlet: search.get("outlet"), paymentMethod: search.get("payment"), transactionStatus: search.get("status") });
    return NextResponse.json({ access: { id: user.id, name: user.name, role: user.role, mode: "demo" }, report });
  } catch (error) {
    if (error instanceof ManagementAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ManagementReportInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Management report failed", error);
    return NextResponse.json({ error: "Management reporting is unavailable." }, { status: 500 });
  }
}
