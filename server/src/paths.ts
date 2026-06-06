import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // server/src
export const REPO_ROOT = resolve(here, "../..");
export const DATA_DIR = resolve(REPO_ROOT, "data");
export const SWATCHES_DIR = resolve(DATA_DIR, "swatches");
export const COLORS_JSON = resolve(DATA_DIR, "colors.json");
export const VAR_DIR = resolve(here, "../var");
export const DB_PATH = resolve(VAR_DIR, "app.db");
export const WEB_DIST = resolve(REPO_ROOT, "web/dist");
