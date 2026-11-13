import type { LlmProviderCode } from "@/domain/llm";

export type JsonRequest = {
  system: string;
  user: string;
  /** JSON Schema describing the required output shape. */
  schema: Record<string, unknown>;
};

/** Returns the model's raw JSON text. Callers must JSON.parse and Zod-validate it (output is untrusted). */
export interface LlmClient {
  generateJson(req: JsonRequest): Promise<string>;
}

export type ActiveLlm = {
  client: LlmClient;
  provider: LlmProviderCode | "env_gemini";
  model: string;
};

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}
