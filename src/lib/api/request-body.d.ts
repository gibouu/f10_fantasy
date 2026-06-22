export type JsonObjectBody = Record<string, unknown>

export interface ReadJsonObjectBodyOptions {
  allowEmpty?: boolean
  invalidJsonMessage?: string
  nonObjectMessage?: string
}

export type ReadJsonObjectBodyResult =
  | { ok: true; body: JsonObjectBody }
  | { ok: false; response: Response }

export function isJsonObjectBody(value: unknown): value is JsonObjectBody

export function readJsonObjectBody(
  request: Request,
  options?: ReadJsonObjectBodyOptions,
): Promise<ReadJsonObjectBodyResult>
