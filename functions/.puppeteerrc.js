import { join } from "path";

export default {
  cacheDirectory: join(import.meta.dirname, "node_modules", ".puppeteer_cache"),
};
