// E2E テスト（GitHub Actions の e2e ジョブで実行）。
// ローカルの Supabase（supabase start）＋ 本番ビルドのアプリ（next start）＋ Claude API のモックに対して、
// スマホの画面サイズでトレーナーとクライアントの操作を通しで確かめる。
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "iphone-chromium",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
