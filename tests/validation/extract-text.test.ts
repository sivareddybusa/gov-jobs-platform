// Phase 7 (ingestion). Real verification that PDF text extraction actually
// works — not just that the code compiles. A hand-built minimal valid PDF
// (generated inline below, no external fixture file/dependency) with known
// text content, checked against the actual extracted output.
import { describe, expect, it } from "vitest";
import {
  detectDocumentType,
  extractTextFromHtml,
  extractTextFromPdf,
} from "@/lib/ingestion/extract-text";

/** Builds a minimal, real, valid single-page PDF containing `text` — no external tooling. */
function buildMinimalPdf(text: string): Buffer {
  const content = Buffer.from(`BT /F1 24 Tf 50 700 Td (${text}) Tj ET`, "latin1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let runningLength = parts[0]!.length;

  for (let i = 0; i < objects.length; i++) {
    offsets.push(runningLength);
    const obj = Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
    parts.push(obj);
    runningLength += obj.length;
  }

  offsets.push(runningLength);
  const streamObj = Buffer.concat([
    Buffer.from(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`),
    content,
    Buffer.from("\nendstream\nendobj\n"),
  ]);
  parts.push(streamObj);
  runningLength += streamObj.length;

  const xrefOffset = runningLength;
  const xrefLines = [`xref\n0 ${objects.length + 2}\n`, "0000000000 65535 f \n"];
  for (const off of offsets) {
    xrefLines.push(`${off.toString().padStart(10, "0")} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length + 2} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xrefLines.join("")), Buffer.from(trailer));

  return Buffer.concat(parts);
}

describe("detectDocumentType", () => {
  it("identifies a PDF by its magic bytes", () => {
    const body = Buffer.from("%PDF-1.4\n...");
    expect(detectDocumentType(body)).toBe("pdf");
  });

  it("identifies HTML by its doctype/tag", () => {
    expect(detectDocumentType(Buffer.from("<!DOCTYPE html><html><body>hi</body></html>"))).toBe(
      "html",
    );
    expect(detectDocumentType(Buffer.from("<html><body>hi</body></html>"))).toBe("html");
  });

  it("returns unknown for neither", () => {
    expect(detectDocumentType(Buffer.from("just some random bytes"))).toBe("unknown");
  });
});

describe("extractTextFromHtml", () => {
  it("strips tags, scripts, styles, and comments, decoding basic entities", () => {
    const html = `
      <html><head><style>body{color:red}</style><script>alert('xss')</script></head>
      <body><!-- a comment -->
        <h1>Junior Assistant Recruitment</h1>
        <p>Age: 18 &amp; above &mdash; apply before 2026-01-01</p>
      </body></html>`;
    const text = extractTextFromHtml(Buffer.from(html));
    expect(text).toContain("Junior Assistant Recruitment");
    expect(text).toContain("Age: 18 & above");
    expect(text).not.toContain("alert(");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<h1>");
  });
});

describe("extractTextFromPdf", () => {
  it("extracts real text from an actual, valid, freshly-generated PDF (not a mock)", async () => {
    const body = buildMinimalPdf("Government Job Notice Test 2026");
    expect(detectDocumentType(body)).toBe("pdf");

    const text = await extractTextFromPdf(body);
    expect(text).toContain("Government Job Notice Test 2026");
  });
});
