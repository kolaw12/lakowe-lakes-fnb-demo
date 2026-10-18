import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { AdvancedReportDataset, ReportCell, ReportColumn } from "@/lib/advanced-reporting";

function csvSafe(value: ReportCell) {
  let text = value === null ? "Unavailable" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function reportValue(value: ReportCell, type: ReportColumn["type"] | "text" | "number" | "money") {
  if (value === null) return "Unavailable";
  if (type === "money" && typeof value === "number") return `₦${(value / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  if (type === "number" && typeof value === "number") return value.toLocaleString("en-NG");
  if (type === "date" && typeof value === "string") return new Date(value).toLocaleString("en-NG");
  return String(value);
}

export function createReportCsv(dataset: AdvancedReportDataset) {
  const lines = [
    ["Lakowe Lakes DEMO Management Report"],
    ["Report", dataset.title],
    ["Generated", dataset.generatedAt],
    ...dataset.appliedFilters.map(filter => [filter.label, filter.value]),
    ["Export row limit", dataset.exportLimit],
    ["Truncated", dataset.truncated ? "Yes" : "No"],
    [],
    ["Summary"],
    ...dataset.summary.map(item => [item.type === "money" ? `${item.label} (kobo)` : item.label, item.value]),
    [],
    dataset.columns.map(column => column.type === "money" ? `${column.label} (kobo)` : column.label),
    ...dataset.rows.map(row => dataset.columns.map(column => row[column.key] ?? null)),
  ];
  return "\uFEFF" + lines.map(row => row.map(csvSafe).join(",")).join("\r\n");
}

export async function createReportPdf(dataset: AdvancedReportDataset) {
  const font = readFileSync(path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"));
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  doc.font(font);
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fillColor("#0a2f1c").fontSize(20).text("Lakowe Lakes");
  doc.fillColor("#a6833c").fontSize(10).text("DEMO MANAGEMENT REPORT");
  doc.moveDown(.35).fillColor("#111111").fontSize(15).text(dataset.title);
  doc.fontSize(8).fillColor("#555555").text(dataset.subtitle).text(`Generated: ${new Date(dataset.generatedAt).toLocaleString("en-NG")}`);
  doc.moveDown(.5).fillColor("#333333").fontSize(8).text(dataset.appliedFilters.map(filter => `${filter.label}: ${filter.value}`).join("   •   "));
  doc.moveDown(.7);
  const startX = doc.x, summaryY = doc.y;
  const summaryWidth = (doc.page.width - 72) / Math.max(dataset.summary.length, 1);
  dataset.summary.forEach((item, index) => {
    doc.fillColor("#6a6a6a").fontSize(7).text(item.label.toUpperCase(), startX + summaryWidth * index, summaryY, { width: summaryWidth - 10 });
    doc.fillColor("#0a2f1c").fontSize(13).text(reportValue(item.value, item.type), startX + summaryWidth * index, summaryY + 12, { width: summaryWidth - 10 });
  });
  doc.x = startX;
  doc.y = summaryY + 40;
  doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor("#d8d0bb").stroke();
  doc.moveDown(.8).fillColor("#a6833c").fontSize(9).text(`RECORDS · ${dataset.rows.length}${dataset.truncated ? ` OF ${dataset.pagination.totalItems} (LIMIT APPLIED)` : ""}`);
  doc.moveDown(.45);
  if (!dataset.rows.length) {
    doc.fillColor("#555555").fontSize(10).text("No records match the applied filters.");
  } else {
    dataset.rows.forEach((row, index) => {
      const line = dataset.columns.map(column => `${column.label}: ${reportValue(row[column.key] ?? null, column.type)}`).join("   |   ");
      doc.fillColor(index % 2 ? "#3d3d3d" : "#111111").fontSize(7).text(`${index + 1}.  ${line}`, { width: doc.page.width - 72, lineGap: 2 });
      doc.moveDown(.45);
    });
  }
  doc.moveDown(.8).fillColor("#666666").fontSize(7).text(`Export limit: ${dataset.exportLimit} rows. ${dataset.truncated ? "Additional matching rows were omitted." : "All matching rows are included."}`);
  doc.end();
  return finished;
}

export function reportFilename(dataset: AdvancedReportDataset, extension: "csv" | "pdf") {
  return `lakowe-demo-${dataset.reportType}-report.${extension}`;
}
