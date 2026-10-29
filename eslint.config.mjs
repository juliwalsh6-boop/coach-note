import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // e2e/ は GitHub Actions の e2e ジョブで Playwright と一緒に動かす（アプリの依存関係には含めない）
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "e2e/**", "test-results/**", "playwright-report/**"]),
]);

export default eslintConfig;
