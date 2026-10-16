// Talks to the Arcanist server this player is served from: same origin, so the refresh token lives in an HttpOnly
// cookie and the access token only in memory.

export interface User {
  id: string;
  userName: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
  permissions: string[];
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
  ) {
    super(code);
  }
}

type Listener = () => void;

let accessToken: string | null = null;
let currentUser: User | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

export const session = {
  get user(): User | null {
    return currentUser;
  },
  get token(): string | null {
    return accessToken;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  can(permission: string): boolean {
    return currentUser?.role === "ADMIN" || (currentUser?.permissions.includes(permission) ?? false);
  },
};

function notify(): void {
  for (const listener of listeners) listener();
}

interface TokenResponse {
  accessToken: string;
  user: User;
}

function accept(response: TokenResponse): void {
  accessToken = response.accessToken;
  currentUser = response.user;
  notify();
}

function clear(): void {
  accessToken = null;
  currentUser = null;
  notify();
}

async function problem(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    return new ApiError(body.code ?? "unknown", response.status);
  } catch {
    return new ApiError(response.status >= 500 ? "server_error" : "unknown", response.status);
  }
}

/** Restores the session from the refresh cookie. One refresh at a time: the token rotates. */
export function refresh(): Promise<boolean> {
  refreshing ??= fetch("/rest/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) {
        clear();
        return false;
      }
      accept(await response.json());
      return true;
    })
    .catch(() => false)
    .finally(() => (refreshing = null));
  return refreshing;
}

export async function login(userName: string, password: string): Promise<void> {
  const response = await fetch("/rest/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userName, password, deviceName: "Webamp", useCookie: true }),
  });
  if (!response.ok) throw await problem(response);
  accept(await response.json());
}

export async function logout(): Promise<void> {
  try {
    await fetch("/rest/v1/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: "{}",
    });
  } finally {
    clear();
  }
}

/** A call with the access token, refreshing it once when the server says it expired. */
async function authorized(input: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(input, {
      ...init,
      credentials: "same-origin",
      headers: { ...(init.headers ?? {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
  let response = await send();
  if (response.status === 401 && (await refresh())) response = await send();
  return response;
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const call = async () => {
    const response = await authorized("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok && response.status !== 400) throw await problem(response);
    return (await response.json()) as { data?: T; errors?: { extensions?: { code?: string } }[] };
  };
  let result = await call();
  // GraphQL reports an expired token in the body.
  if (result.errors?.[0]?.extensions?.code === "unauthorized" && (await refresh())) result = await call();
  if (result.errors?.length) throw new ApiError(result.errors[0].extensions?.code ?? "unknown");
  return result.data as T;
}

export async function rest<T>(method: string, path: string, body?: BodyInit | object, contentType?: string): Promise<T> {
  const isRaw = body instanceof Blob || body instanceof ArrayBuffer || typeof body === "string";
  const response = await authorized(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": contentType ?? (isRaw ? "application/octet-stream" : "application/json") },
    body: body === undefined ? undefined : isRaw ? (body as BodyInit) : JSON.stringify(body),
  });
  if (!response.ok) throw await problem(response);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** An absolute URL on this server (stream URLs come relative). */
export function absolute(url: string): string {
  return new URL(url, location.origin).href;
}

export function artworkUrl(id: string | null | undefined, size = 256): string | undefined {
  return id ? absolute(`/rest/v1/artwork/${id}?size=${size}`) : undefined;
}
