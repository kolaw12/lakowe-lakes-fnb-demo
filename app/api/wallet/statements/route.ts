import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { DEMO_GOLFER } from "@/lib/wallet";
import type { StatementResponse } from "@/lib/statement";

export const runtime = "nodejs";
type StatementData = Pick<StatementResponse, "rows" | "total" | "from" | "to">;
const safe = (value: string) => /^[=+\-@]/.test(value) ? `'${value}` : value;
const naira = (amount: number) => `₦${(amount / 100).toLocaleString("en-NG")}`;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

async function statement(request: NextRequest): Promise<StatementData> {
  const q = request.nextUrl.searchParams;
  const from = q.get("from"), to = q.get("to"), outlet = q.get("outlet"), payment = q.get("payment");
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to) || (payment && payment !== "wallet_demo")) {
    throw new Error("Invalid statement filters.");
  }
  const account = await prisma.walletAccount.findUnique({ where: { userId: DEMO_GOLFER } });
  if (!account) return { rows: [], total: 0, from, to };
  const entries = await prisma.walletLedgerEntry.findMany({
    where: {
      walletId: account.id, type: "purchase", status: "posted",
      ...(from || to ? { createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const orders = await prisma.order.findMany({
    where: {
      reference: { in: entries.map(entry => entry.orderReference || "") },
      ...(outlet ? { outletId: outlet } : {}),
      ...(payment ? { paymentMethod: payment } : {}),
    },
    include: { outlet: true, transaction: true },
  });
  const rows = entries.flatMap(entry => {
    const order = orders.find(item => item.reference === entry.orderReference);
    return order && order.transaction?.status === "settled" ? [{
      reference: entry.reference, orderReference: order.reference, outlet: order.outlet.name,
      amount: Math.abs(entry.amount), paymentMethod: order.paymentMethod, status: entry.status,
      createdAt: entry.createdAt.toISOString(),
    }] : [];
  });
  return { rows, total: rows.reduce((sum, row) => sum + row.amount, 0), from, to };
}

export async function GET(request: NextRequest) {
  try {
    const data = await statement(request);
    const format = request.nextUrl.searchParams.get("format");
    const generatedAt = new Date().toISOString();
    if (format === "csv") {
      const csv = [
        "Lakowe Lakes DEMO Expenditure Statement",
        `Period,${data.from || "All time"} to ${data.to || "Present"}`,
        `Generated,${generatedAt}`,
        "Date,Reference,Order,Outlet,Payment,Status,Amount",
        ...data.rows.map(row => [row.createdAt, safe(row.reference), safe(row.orderReference), safe(row.outlet), row.paymentMethod, row.status, row.amount].join(",")),
        `Total,,,,,,${data.total}`,
      ].join("\n");
      return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=lakowe-demo-statement.csv" } });
    }
    if (format === "pdf") {
      // Noto Sans is SIL OFL licensed. PDFKit embeds only the glyph subset used.
      const font = readFileSync(path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"));
      const doc = new PDFDocument({ margin: 42 });
      doc.font(font);
      const chunks: Buffer[] = [];
      const finished = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
      });
      doc.fontSize(20).fillColor("#0a2f1c").text("Lakowe Lakes");
      doc.fontSize(12).fillColor("#A6833C").text("DEMO EXPENDITURE STATEMENT");
      doc.moveDown().fillColor("#1a1a1a").fontSize(10)
        .text("Account: golfer-demo · Tunde Adeyemi")
        .text(`Period: ${data.from || "All time"} to ${data.to || "Present"}`)
        .text(`Generated: ${new Date(generatedAt).toLocaleString("en-NG")}`).moveDown();
      if (!data.rows.length) doc.text("No eligible expenditure in this period.");
      data.rows.forEach(row => {
        doc.fontSize(9).text(`${new Date(row.createdAt).toLocaleDateString("en-NG")}  ${row.outlet}  ${row.orderReference}  ${row.paymentMethod}  ${naira(row.amount)}`);
      });
      doc.moveDown().fontSize(13).fillColor("#0a2f1c").text(`Total eligible expenditure: ${naira(data.total)}`);
      doc.end();
      const pdf = await finished;
      return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=lakowe-demo-statement.pdf" } });
    }
    const response: StatementResponse = { ...data, generatedAt, coverage: "Lakowe Lakes demo wallet purchases only" };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Statement unavailable." }, { status: 400 });
  }
}
