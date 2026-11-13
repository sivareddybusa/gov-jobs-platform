import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="max-w-md text-sm text-gray-500">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  );
}
