import { cn } from "@/lib/cn";

export function FormMessage({ status, message }: { status: "error" | "success"; message: string }) {
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        status === "error" && "border-red-100 bg-red-50 text-red-700",
        status === "success" && "border-green-100 bg-green-50 text-green-700",
      )}
    >
      {message}
    </p>
  );
}
