import {
  ColorsResponseSchema,
  ColorWithInventorySchema,
  UserSchema,
  type ColorWithInventory,
  type Credentials,
  type InventoryInput,
  type OwnedFilter,
  type Sort,
  type User,
} from "shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && String(data.error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data;
}

export interface ColorQuery {
  q?: string;
  owned?: OwnedFilter;
  sort?: Sort;
}

export const api = {
  async me(): Promise<User | null> {
    try {
      return UserSchema.parse(await request("/api/auth/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async login(creds: Credentials): Promise<User> {
    return UserSchema.parse(
      await request("/api/auth/login", { method: "POST", body: JSON.stringify(creds) }),
    );
  },

  async register(creds: Credentials): Promise<User> {
    return UserSchema.parse(
      await request("/api/auth/register", { method: "POST", body: JSON.stringify(creds) }),
    );
  },

  async logout(): Promise<void> {
    await request("/api/auth/logout", { method: "POST" });
  },

  async colors(query: ColorQuery = {}): Promise<ColorWithInventory[]> {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.owned && query.owned !== "all") params.set("owned", query.owned);
    if (query.sort) params.set("sort", query.sort);
    const qs = params.toString();
    return ColorsResponseSchema.parse(await request(`/api/colors${qs ? `?${qs}` : ""}`));
  },

  async color(code: string): Promise<ColorWithInventory> {
    return ColorWithInventorySchema.parse(await request(`/api/colors/${code}`));
  },

  async setInventory(code: string, input: InventoryInput): Promise<ColorWithInventory> {
    return ColorWithInventorySchema.parse(
      await request(`/api/inventory/${code}`, { method: "PUT", body: JSON.stringify(input) }),
    );
  },
};
