import { PAPER_KINDS, PAPER_KIND_LABELS, type PaperKind } from "@/domain/materials";
import type { PaperRow } from "@/db/materials";

export function hasPapers(grouped: Record<PaperKind, PaperRow[]>): boolean {
  return PAPER_KINDS.some((k) => grouped[k].length > 0);
}

/** Groups already-ordered rows by year, keeping the "no year stated" group last. */
function byYear(rows: PaperRow[]): Array<{ year: number | null; rows: PaperRow[] }> {
  const groups: Array<{ year: number | null; rows: PaperRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.year === row.paperYear) last.rows.push(row);
    else groups.push({ year: row.paperYear, rows: [row] });
  }
  return groups;
}

/** Official question papers and answer keys as links. Nothing is hosted or copied here. */
export function PaperList({ grouped }: { grouped: Record<PaperKind, PaperRow[]> }) {
  return (
    <div className="flex flex-col gap-4">
      {PAPER_KINDS.filter((k) => grouped[k].length > 0).map((kind) => (
        <div key={kind}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {PAPER_KIND_LABELS[kind]}
          </h3>
          <div className="flex flex-col gap-2">
            {byYear(grouped[kind]).map((g) => (
              <div key={g.year ?? "none"}>
                <p className="text-xs font-medium text-gray-700" data-testid="paper-year">
                  {g.year ?? "Year not stated in the link"}
                </p>
                <ul className="flex flex-col gap-1">
                  {g.rows.map((p) => (
                    <li key={p.id} className="text-sm">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {p.title} ↗
                      </a>
                      <span className="ml-2 text-xs text-gray-500">{p.host}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
        Links are collected automatically from the exam&apos;s official website and open there. The
        year is shown only when the link itself states it. Always confirm the paper and its year on
        the official site.
      </p>
    </div>
  );
}
