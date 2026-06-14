// Browser-side PDF generation for audit reports using jsPDF.
import jsPDF from "jspdf";
import type { ParsedAudit } from "./parse";
import { formatZar } from "./parse";

interface PdfMeta {
  clientName: string;
  pageLabel: string;
  pageUrl: string;
  createdAt: string;
  agencyName: string;
}

const MARGIN = 50;
const PAGE_W = 595; // A4 px @ 72dpi roughly
const PAGE_H = 842;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function generateAuditPdf(parsed: ParsedAudit, meta: PdfMeta): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  function newPage() {
    doc.addPage();
    y = MARGIN;
  }
  function ensure(h: number) {
    if (y + h > PAGE_H - MARGIN) newPage();
  }
  function text(str: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; lineGap?: number } = {}) {
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    if (opts.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(20, 20, 30);
    const lines = doc.splitTextToSize(str, CONTENT_W);
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, MARGIN, y);
      y += size + (opts.lineGap ?? 2);
    }
  }
  function rule() {
    ensure(20);
    doc.setDrawColor(220, 220, 230);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 14;
  }

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("CRO Audit Report", MARGIN, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(meta.agencyName, MARGIN, 70);
  y = 120;

  text(meta.clientName, 18, { bold: true });
  text(meta.pageLabel, 13);
  text(meta.pageUrl, 10, { color: [100, 116, 139] });
  text(new Date(meta.createdAt).toLocaleString(), 9, { color: [100, 116, 139] });
  y += 8;
  rule();

  // Score
  text(`CRO Score: ${parsed.score} / 100  —  ${parsed.rating}`, 16, { bold: true });
  y += 6;

  if (parsed.executiveSummary) {
    text("Executive Summary", 13, { bold: true });
    text(parsed.executiveSummary, 11, { lineGap: 3 });
    y += 6;
  }

  if (parsed.progressTracker) {
    text("Progress since last audit", 13, { bold: true });
    const p = parsed.progressTracker;
    text(`Fixes completed: ${p.fixesCompleted}   Still outstanding: ${p.stillOutstanding}   New: ${p.newIssuesFound}   Actioned: ${p.percentActioned}%`, 10);
    if (p.narrative) text(p.narrative, 10, { lineGap: 3 });
    y += 6;
  }

  rule();
  text("Friction Points", 14, { bold: true });
  y += 4;
  for (const f of parsed.frictionPoints) {
    ensure(50);
    const sevColor: [number, number, number] =
      f.severity === "CRITICAL" ? [239, 68, 68] :
      f.severity === "HIGH" ? [245, 158, 11] :
      f.severity === "MEDIUM" ? [79, 140, 255] : [34, 197, 94];
    text(`[${f.severity}]${f.recurring ? " ⚠ RECURRING" : ""}  ${f.title}`, 12, { bold: true, color: sevColor });
    text(`Fix: ${f.fix}`, 10, { lineGap: 3 });
    if (f.revenueImpact > 0) text(`Potential: +${formatZar(f.revenueImpact)} / month`, 10, { color: [34, 197, 94] });
    y += 6;
  }

  rule();
  text("Revenue Scenarios", 14, { bold: true });
  text(`Conservative (10% lift): ${formatZar(parsed.revenueScenarios.conservative)} / month`, 11);
  text(`Moderate (20% lift): ${formatZar(parsed.revenueScenarios.moderate)} / month`, 11);
  text(`Optimistic (35% lift): ${formatZar(parsed.revenueScenarios.optimistic)} / month`, 11);
  y += 6;

  if (parsed.abTests.length) {
    rule();
    text("A/B Test Hypotheses", 14, { bold: true });
    parsed.abTests.forEach((t, i) => {
      text(`${i + 1}. ${t.title}`, 11, { bold: true });
      text(t.description, 10, { lineGap: 3 });
      y += 4;
    });
  }

  if (parsed.actionPlan.length) {
    rule();
    text("Priority Action Plan", 14, { bold: true });
    parsed.actionPlan.forEach((a, i) => text(`${i + 1}. ${a}`, 11, { lineGap: 3 }));
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text(`${meta.agencyName} · ${meta.clientName} · Page ${i} of ${pageCount}`,
      PAGE_W / 2, PAGE_H - 20, { align: "center" });
  }

  return doc.output("blob");
}
