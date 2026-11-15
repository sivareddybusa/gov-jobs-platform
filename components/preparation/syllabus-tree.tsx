import type { SyllabusNode } from "@/domain/syllabus";
import { SYLLABUS_LEVEL_LABELS } from "@/domain/syllabus";

function Branch({ node, depth }: { node: SyllabusNode; depth: number }) {
  const children = node.children ?? [];
  if (children.length === 0) {
    return (
      <li className="py-1 text-sm text-gray-700" data-depth={depth}>
        {node.name}
      </li>
    );
  }
  return (
    <li data-depth={depth}>
      <details className="group py-0.5" open={depth === 1}>
        <summary
          className={
            depth === 1
              ? "cursor-pointer py-1.5 text-sm font-semibold text-gray-900"
              : "cursor-pointer py-1 text-sm font-medium text-gray-800"
          }
          title={SYLLABUS_LEVEL_LABELS[depth - 1]}
        >
          {node.name}
          <span className="ml-2 text-xs font-normal text-gray-400">({children.length})</span>
        </summary>
        <ul className="ml-4 border-l border-gray-200 pl-3">
          {children.map((c) => (
            <Branch key={c.name} node={c} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** Server-rendered, JS-free expandable syllabus tree (subject → chapter → topic). */
export function SyllabusTree({ tree }: { tree: SyllabusNode[] }) {
  return (
    <ul aria-label="Syllabus">
      {tree.map((n) => (
        <Branch key={n.name} node={n} depth={1} />
      ))}
    </ul>
  );
}
