import "server-only";

// SECURITY.md §11: "Unsafe document processing... reads document *content*
// (text, embedded metadata) without executing embedded scripts, macros, or
// active content" — both paths below are read-only text extraction. Never
// renders the PDF, never evaluates any HTML/JS.

export class DocumentTypeError extends Error {}

const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

/**
 * File-type validation by actual content (magic bytes), not by the
 * source-controlled Content-Type header or a URL's file extension
 * (SECURITY.md §11: "the file's actual content/magic-bytes are checked,
 * not just the Content-Type header or file extension a source claims,
 * since both are attacker/source-controllable").
 */
export function detectDocumentType(body: Buffer): "pdf" | "html" | "unknown" {
  if (body.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES)) return "pdf";
  const head = body.subarray(0, 512).toString("utf-8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<html")) {
    return "html";
  }
  return "unknown";
}

/** Read-only text extraction from a PDF — never renders it, never executes embedded content. */
export async function extractTextFromPdf(body: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(body) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Crude but safe plain-text extraction from HTML: strips script/style
 * blocks and tags via string operations, never parses/executes the
 * document as a DOM or evaluates any script — same "read-only, never
 * execute" posture as the PDF path. Good enough for feeding a government
 * notice page's visible text to the extraction model; not a rendering
 * engine and never becomes one.
 */
export function extractTextFromHtml(body: Buffer): string {
  const html = body.toString("utf-8");
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractText(body: Buffer): Promise<{ type: "pdf" | "html"; text: string }> {
  const type = detectDocumentType(body);
  if (type === "pdf") return { type, text: await extractTextFromPdf(body) };
  if (type === "html") return { type, text: extractTextFromHtml(body) };
  throw new DocumentTypeError(
    "Unsupported or unrecognized document type — only PDF and HTML are accepted (SECURITY.md §11).",
  );
}
