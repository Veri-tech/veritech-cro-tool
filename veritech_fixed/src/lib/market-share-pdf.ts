// Browser-side PDF for Market Share reports.
import jsPDF from "jspdf";

export interface MarketSharePdfMeta {
  agencyName: string;
  clientName: string;
  clientUrl: string;
  clientScore: number;
  generatedAt: string;
}

export interface MarketSharePdfCompetitor {
  name: string;
  domain: string;
  score: number;
  rating: string;
  traffic_est: number | null;
  data_source: string;
  top_friction: { severity: string; title: string; fix: string }[];
}

const MARGIN = 50;
const PAGE_W = 595;
const PAGE_H = 842;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function generateMarketSharePdf(
  meta: MarketSharePdfMeta,
  competitors: MarketSharePdfCompetitor[],
  synthesis: string,
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - MARGIN) newPage();
  };
  const text = (
    s: string,
    size: number,
    opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {},
  ) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    if (opts.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(20, 20, 30);
    const lines = doc.splitTextToSize(s, CONTENT_W);
    for (const ln of lines) {
      ensure(size + 4);
      doc.text(ln, MARGIN, y);
      y += size + (opts.gap ?? 2);
    }
  };
  const hr = () => {
    ensure(12);
    doc.setDrawColor(220);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 12;
  };

  // Header
  text(`${meta.agencyName} — Market Share Analysis`, 18, { bold: true, gap: 4 });
  text(meta.clientName, 14, { bold: true, color: [79, 140, 255], gap: 2 });
  text(meta.clientUrl, 9, { color: [120, 120, 130], gap: 2 });
  text(`Generated ${new Date(meta.generatedAt).toLocaleString()}`, 9, {
    color: [120, 120, 130],
    gap: 8,
  });
  hr();

  // Client score banner
  text(`Your CRO Score: ${meta.clientScore}/100`, 16, {
    bold: true,
    color: [79, 140, 255],
    gap: 10,
  });
  hr();

  // Competitor cards
  text("Competitors", 14, { bold: true, gap: 6 });
  for (const c of competitors) {
    ensure(80);
    text(`${c.name} — ${c.score}/100 (${c.rating})`, 12, { bold: true, gap: 2 });
    text(`${c.domain} · ${c.data_source}${c.traffic_est ? ` · ~${c.traffic_est.toLocaleString()} sessions/mo` : ""}`, 9, { color: [120, 120, 130], gap: 4 });
    if (c.top_friction.length > 0) {
      for (const f of c.top_friction.slice(0, 3)) {
        text(`• [${f.severity}] ${f.title}`, 10, { bold: true, gap: 1 });
        if (f.fix) text(`  ${f.fix}`, 9, { color: [80, 80, 90], gap: 2 });
      }
    }
    y += 6;
  }
  hr();

  // Synthesis sections — print raw, but format headings
  text("Synthesis", 14, { bold: true, gap: 6 });
  const sections = (synthesis ?? "").split(/\n(?=#\s)/);
  for (const sec of sections) {
    if (!sec.trim()) continue;
    const lines = sec.split("\n");
    let first = true;
    for (const line of lines) {
      if (!line.trim()) {
        y += 4;
        continue;
      }
      if (first && line.startsWith("#")) {
        text(line.replace(/^#+\s*/, ""), 13, { bold: true, color: [79, 140, 255], gap: 4 });
        first = false;
      } else if (line.startsWith("##")) {
        text(line.replace(/^#+\s*/, ""), 11, { bold: true, gap: 2 });
      } else {
        text(line, 10, { gap: 2 });
      }
    }
    y += 6;
  }

  return doc.output("blob");
}
