import type { User } from "shared";

/** Hono environment: middleware populates `user` from the session cookie. */
export type AppEnv = {
  Variables: {
    user: User | null;
  };
};
