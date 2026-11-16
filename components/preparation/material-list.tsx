import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, type MaterialKind } from "@/domain/materials";
import type { MaterialRow } from "@/db/materials";

/** Official document links grouped by kind. Links open the official site; nothing is hosted here. */
export function MaterialList({ grouped }: { grouped: Record<MaterialKind, MaterialRow[]> }) {
  const kinds = MATERIAL_KINDS.filter((k) => grouped[k].length > 0);
  return (
    <div className="flex flex-col gap-4">
      {kinds.map((kind) => (
        <div key={kind}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {MATERIAL_KIND_LABELS[kind]}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {grouped[kind].map((m) => (
              <li key={m.id} className="text-sm">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  {m.title} ↗
                </a>
                <span className="ml-2 text-xs text-gray-500">{m.host}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
        Links are collected automatically from official websites; documents open on the official
        site. Always confirm details in the latest official notification.
      </p>
    </div>
  );
}

export function hasMaterials(grouped: Record<MaterialKind, MaterialRow[]>): boolean {
  return MATERIAL_KINDS.some((k) => grouped[k].length > 0);
}
