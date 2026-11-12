/** fetch wrapper: same-origin cookies, CSRF header, typed errors. */

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

// FastAPI 422 bodies: {detail: [{loc: ["body", "field"], msg}]}. Model-level errors
// (e.g. renewal before start) have loc ["body"] and are reported under "_form".
function parseError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (Array.isArray(detail)) {
    const fieldErrors: FieldErrors = {};
    for (const issue of detail as ValidationIssue[]) {
      const field = issue.loc.length > 1 ? String(issue.loc[issue.loc.length - 1]) : "_form";
      fieldErrors[field] ??= issue.msg.replace(/^Value error, /, "");
    }
    return new ApiError(status, Object.values(fieldErrors)[0] ?? "Invalid input", fieldErrors);
  }
  if (typeof detail === "string") return new ApiError(status, detail);
  if (status === 429) return new ApiError(status, "Too many attempts. Please wait a minute.");
  return new ApiError(status, `Request failed (${status})`);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "Network error. Check your connection.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw parseError(res.status, body);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
