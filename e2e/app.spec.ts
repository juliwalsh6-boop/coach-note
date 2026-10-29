/**
 * 画面を通した動作確認（E2E）。スマホ（iPhone 13 の画面サイズ）で、トレーナー・クライアントの操作を順に行う。
 *
 * 確かめること（仕様の「PHASE 8」に対応）
 *   1 クライアントのログイン / 2 食事写真のアップロード / 3 AI 解析結果の修正と保存
 *   4 食事記録の追加・編集・削除 / 5 PFC とカロリーの集計 / 6 過去の日付の表示
 *   7 コンビニ・外食メニューの検索 / 8 組み合わせの計算 / 9 残りに合わせた候補
 *   10 トレーナーによる閲覧 / 11 トレーナーの目標設定 / 12 コメントの送受信
 *   13 ユーザー間のアクセス制限 / 14 スマホのレイアウト / 15 API エラー時の処理
 *   16 既存のトレーニング機能（メニュー作成 → 実施 → トレーナーが確認）
 *
 * 前提: ローカルの Supabase にマイグレーションと supabase/data/foods.sql が入っていること、
 *       アプリは ANTHROPIC_BASE_URL で e2e/mock-anthropic.mjs を向いていること（.github/workflows/build.yml の e2e ジョブ）。
 */
import { createClient } from "@supabase/supabase-js";
import { devices, expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import path from "node:path";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const FIXTURES = path.join(__dirname, "fixtures");

const RUN = Date.now().toString(36);
const PASSWORD = "e2e-Password-2026";
const TRAINER = { name: "E2Eトレーナー", email: `e2e-trainer-${RUN}@example.com` };
const CLIENT = { name: "E2Eクライアント", email: `e2e-client-${RUN}@example.com` };
const TRAINER2 = { name: "E2E別トレーナー", email: `e2e-trainer2-${RUN}@example.com` };
const CLIENT2 = { name: "E2E別クライアント", email: `e2e-client2-${RUN}@example.com` };

// iPhone 13 の画面サイズ・タッチ操作（ブラウザは Chromium）
const { defaultBrowserType: _browserType, ...IPHONE } = devices["iPhone 13"];
void _browserType;

test.describe.configure({ mode: "serial" });

let trainer: Page;
let client: Page;
let contexts: BrowserContext[] = [];
let clientId = "";

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ...IPHONE, baseURL: BASE_URL, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`[pageerror] ${page.url()} ${error.message}`));
  return page;
}

/** 横スクロールが出ていない（スマホで画面からはみ出していない）こと */
async function expectFitsScreen(page: Page, label: string) {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
      message: `${label}: 画面の横幅からはみ出していない`,
    })
    .toBeLessThanOrEqual(0);
}

function toNumber(text: string | undefined): number {
  return text ? Number(text.replace(/,/g, "")) : Number.NaN;
}

/** 1 日の摂取量（画面の「目標と摂取量」の表示を読む） */
async function dayIntake(page: Page) {
  const text = await page.locator('section[aria-label="今日の目標と摂取量"]').innerText();
  return {
    kcal: toNumber(text.match(/摂取カロリー\s*([\d,]+)/)?.[1]),
    protein: toNumber(text.match(/たんぱく質[^\d]*([\d.]+)/)?.[1]),
    fat: toNumber(text.match(/脂質[^\d]*([\d.]+)/)?.[1]),
    carbs: toNumber(text.match(/炭水化物[^\d]*([\d.]+)/)?.[1]),
  };
}

async function expectDayIntake(page: Page, expected: { kcal: number; protein: number; fat: number; carbs: number }) {
  await expect.poll(() => dayIntake(page), { message: "1 日の合計が記録の合計と一致する" }).toEqual(expected);
}

function mealSection(page: Page, label: "朝食" | "昼食" | "夕食" | "間食"): Locator {
  return page.locator(`section[aria-label="${label}"]`);
}

async function signUp(page: Page, url: string, who: { name: string; email: string }, submit: string) {
  await page.goto(url);
  await page.getByLabel("表示名").fill(who.name);
  await page.getByLabel("メールアドレス").fill(who.email);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: submit }).click();
}

async function createInviteUrl(page: Page): Promise<string> {
  await page.goto("/trainer/invite");
  await page.getByRole("button", { name: "招待リンクを作成" }).click();
  const link = page.getByText(/\/join\/[A-Z0-9]+/).first();
  await expect(link).toBeVisible();
  const url = (await link.textContent())?.trim() ?? "";
  expect(url).toMatch(/\/join\/[A-Z0-9]+$/);
  return url;
}

async function closeSheet(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.beforeAll(async ({ browser }) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL を設定してください").not.toBe("");
  trainer = await newPage(browser);
  client = await newPage(browser);
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  contexts = [];
});

test("1. トレーナー登録 → 招待 → クライアント登録・ログイン", async () => {
  await signUp(trainer, "/signup", TRAINER, "トレーナーとして登録");
  await trainer.waitForURL(/\/trainer$/);

  const inviteUrl = await createInviteUrl(trainer);
  await signUp(client, inviteUrl, CLIENT, "登録して始める");
  await client.waitForURL(/\/client$/);
  await expect(client.getByText(`担当トレーナー: ${TRAINER.name}`)).toBeVisible();

  // ログアウト → ログイン（クライアントのログイン）
  await client.goto("/client/account");
  await client.getByRole("button", { name: "ログアウト" }).click();
  await client.waitForURL(/\/login/);
  await client.getByLabel("メールアドレス").fill(CLIENT.email);
  await client.getByLabel("パスワード").fill(PASSWORD);
  await client.getByRole("button", { name: "ログイン", exact: true }).click();
  await client.waitForURL(/\/client$/);
  await expectFitsScreen(client, "クライアントのホーム");

  // トレーナーの一覧から、クライアントの id を取る
  await trainer.goto("/trainer");
  await trainer.getByRole("link", { name: new RegExp(CLIENT.name) }).first().click();
  await trainer.waitForURL(/\/trainer\/clients\/[0-9a-f-]{36}/);
  clientId = trainer.url().match(/clients\/([0-9a-f-]{36})/)?.[1] ?? "";
  expect(clientId).not.toBe("");
});

test("16. 既存のトレーニング機能: メニュー作成 → クライアントが実施 → トレーナーが確認", async () => {
  await trainer.goto(`/trainer/clients/${clientId}/plans/new`);
  await trainer.locator("#plan-title").fill("E2E 胸の日");
  await trainer.getByLabel("1番目の種目名").fill("ベンチプレス");
  await trainer.getByLabel("重量").first().fill("40");
  await trainer.getByRole("button", { name: `${CLIENT.name}さんに渡す` }).click();
  await trainer.waitForURL(new RegExp(`/trainer/clients/${clientId}$`));
  await expect(trainer.getByText("E2E 胸の日")).toBeVisible();

  await client.goto("/client");
  await expect(client.getByText("E2E 胸の日")).toBeVisible();
  await client.getByRole("button", { name: "スタート" }).first().click();
  await client.waitForURL(/\/client\/workout\//);
  await client.getByRole("button", { name: "セット完了" }).click();
  await client.getByRole("button", { name: "トレーニング完了" }).click();
  await client.getByRole("alertdialog").getByRole("button", { name: "完了する" }).click();
  const proceed = client.getByRole("button", { name: "続ける" });
  await expect(proceed).toHaveAttribute("aria-disabled", "false", { timeout: 30_000 });
  await proceed.click();
  await client.waitForURL(/\/client\/history\//);

  await trainer.goto(`/trainer/clients/${clientId}?tab=sessions`);
  await expect(trainer.getByText("E2E 胸の日")).toBeVisible();
  await trainer.goto("/trainer");
  await expect(trainer.getByText(CLIENT.name).first()).toBeVisible();
});

test("11. トレーナーが栄養目標を設定する（適用開始日つき）", async () => {
  await trainer.goto(`/trainer/clients/${clientId}/nutrition`);
  await expect(trainer.getByText("まだ目標がありません")).toBeVisible();
  await trainer.getByLabel("カロリー").first().fill("2000");
  await trainer.getByLabel("たんぱく質").first().fill("150");
  await trainer.getByLabel("脂質").first().fill("55");
  await trainer.getByLabel("炭水化物").first().fill("220");
  await expect(trainer.getByText("P・F・C から計算すると 1,975kcal")).toBeVisible();
  await trainer.getByRole("button", { name: "今日から適用して保存" }).click();
  await expect(trainer.getByText(/目標を保存しました/)).toBeVisible();
  await expect(trainer.getByText(/から適用中/)).toBeVisible();
  // 許容範囲を空欄にした分は自動（±10% 前後）
  await expect(trainer.getByText("kcal ±200").first()).toBeVisible();
  await expectFitsScreen(trainer, "栄養目標の設定");
});

test("4・5・7. 検索して追加・量の変更・削除と、1 日の合計", async () => {
  await client.goto("/client/meals");
  await expect(client.getByRole("heading", { name: "今日の食事" })).toBeVisible();
  await expect(client.getByText("/ 2,000 kcal")).toBeVisible();
  await expectFitsScreen(client, "食事の画面");

  await client.getByRole("button", { name: "食品・メニューを検索して追加" }).click();
  const sheet = client.getByRole("dialog");
  await sheet.getByRole("radio", { name: "昼食" }).click();
  await sheet.getByPlaceholder("例: サラダチキン、牛丼、おにぎり").fill("サラダチキン スモーク");
  await sheet.getByRole("button", { name: /7プレミアム サラダチキン スモーク/ }).click();
  await expect(sheet.getByText("確認済み").first()).toBeVisible();
  await sheet.getByRole("button", { name: "昼食に追加する" }).click();
  await expect(sheet.getByText(/追加しました: 7プレミアム サラダチキン スモーク/)).toBeVisible();

  await sheet.getByPlaceholder("例: サラダチキン、牛丼、おにぎり").fill("銀しゃりむすび");
  await sheet.getByRole("button", { name: /銀しゃりむすび 焼しゃけ/ }).click();
  await sheet.getByRole("button", { name: "×2", exact: true }).click();
  await sheet.getByRole("button", { name: "昼食に追加する" }).click();
  await expect(sheet.getByText(/銀しゃりむすび 焼しゃけ（昼食）/)).toBeVisible();
  await expectFitsScreen(client, "食べたものを追加");
  await closeSheet(client);

  // 117kcal・P26.0・F1.3・C0.0 ＋ 179kcal・P4.3・F1.6・C37.6 × 2
  const lunch = mealSection(client, "昼食");
  await expect(lunch.getByText("7プレミアム サラダチキン スモーク")).toBeVisible();
  await expect(lunch.getByText("銀しゃりむすび 焼しゃけ")).toBeVisible();
  await expectDayIntake(client, { kcal: 475, protein: 34.6, fat: 4.5, carbs: 75.2 });

  // 量を 2 個 → 1 個に変更
  await lunch.getByRole("button", { name: "銀しゃりむすび 焼しゃけを編集" }).click();
  await client.getByRole("dialog").getByRole("button", { name: "×1", exact: true }).click();
  await client.getByRole("dialog").getByRole("button", { name: "保存する" }).click();
  await expect(client.getByRole("dialog")).toHaveCount(0);
  await expectDayIntake(client, { kcal: 296, protein: 30.3, fat: 2.9, carbs: 37.6 });

  // 削除
  await lunch.getByRole("button", { name: "7プレミアム サラダチキン スモークを編集" }).click();
  await client.getByRole("dialog").getByRole("button", { name: "削除" }).click();
  await client.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(lunch.getByText("7プレミアム サラダチキン スモーク")).toHaveCount(0);
  await expectDayIntake(client, { kcal: 179, protein: 4.3, fat: 1.6, carbs: 37.6 });
});

test("2・3. 写真をアップロード → AI の推定を直して保存（写真も保存）", async () => {
  await client.goto("/client/meals");
  await client.locator('input[type="file"]:not([capture])').setInputFiles(path.join(FIXTURES, "meal.jpg"));
  const sheet = client.getByRole("dialog");
  await expect(sheet.getByText("AI の推定結果")).toBeVisible({ timeout: 60_000 });
  await expect(sheet.getByText("ごはん").first()).toBeVisible();
  await expect(sheet.getByText("鶏の照り焼き").first()).toBeVisible();
  await expectFitsScreen(client, "写真で記録");

  // 2 品目（鶏の照り焼き）のカロリーを 300 → 280 に直す
  await sheet.getByRole("button", { name: /内容・量を直す/ }).nth(1).click();
  await sheet.getByLabel("カロリー").fill("280");
  await sheet.getByRole("radio", { name: "夕食" }).click();
  await sheet.getByRole("button", { name: "夕食に記録する" }).click();
  await expect(client.getByText("夕食に記録しました")).toBeVisible();
  await expect(client.getByRole("dialog")).toHaveCount(0);

  const dinner = mealSection(client, "夕食");
  await expect(dinner.getByText("鶏の照り焼き")).toBeVisible();
  await expect(dinner.getByText("AI推定を修正")).toBeVisible();
  await expect(dinner.getByText("AI推定", { exact: true })).toBeVisible();
  // 保存した写真は非公開バケットから署名付き URL で表示される
  const photo = dinner.locator("img").first();
  await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // 179 ＋ ごはん 234（P3.8 F0.5 C55.7）＋ 鶏の照り焼き 280（P25 F18 C10）
  await expectDayIntake(client, { kcal: 693, protein: 33.1, fat: 20.1, carbs: 103.3 });
});

test("15. AI がエラーを返したら手入力に切り替えて記録できる", async () => {
  await client.locator('input[type="file"]:not([capture])').setInputFiles(path.join(FIXTURES, "small.jpg"));
  const sheet = client.getByRole("dialog");
  await expect(sheet.getByText("AI解析が混み合っています")).toBeVisible({ timeout: 60_000 });
  await expect(sheet.getByText("手入力で記録")).toBeVisible();
  await sheet.getByRole("button", { name: /内容・量を直す/ }).first().click();
  await sheet.getByLabel("名前").fill("プロテインバー");
  await sheet.getByLabel("カロリー").fill("200");
  await sheet.getByLabel("たんぱく質").fill("20");
  await sheet.getByLabel("脂質").fill("8");
  await sheet.getByLabel("炭水化物").fill("15");
  await sheet.getByRole("radio", { name: "間食" }).click();
  await sheet.getByRole("button", { name: "間食に記録する" }).click();
  await expect(client.getByText("間食に記録しました")).toBeVisible();
  await expect(mealSection(client, "間食").getByText("プロテインバー")).toBeVisible();
  await expectDayIntake(client, { kcal: 893, protein: 53.1, fat: 28.1, carbs: 118.3 });
});

test("6. 過去の日付: 前の日を表示して記録し、今日の合計には入らない", async () => {
  await client.goto("/client/meals");
  await client.getByRole("link", { name: "前の日" }).click();
  await expect(client.getByRole("heading", { name: "昨日の食事" })).toBeVisible();
  await expect(client.getByRole("link", { name: "今日に戻る" })).toBeVisible();

  await client.getByRole("button", { name: "食品・メニューを検索して追加" }).click();
  const sheet = client.getByRole("dialog");
  await sheet.getByRole("radio", { name: "夕食" }).click();
  await sheet.getByPlaceholder("例: サラダチキン、牛丼、おにぎり").fill("牛丼 並盛");
  await sheet.getByRole("button", { name: /牛丼 並盛/ }).first().click();
  await sheet.getByRole("button", { name: "夕食に追加する" }).click();
  await expect(sheet.getByText(/追加しました: 牛丼 並盛/)).toBeVisible();
  await closeSheet(client);
  await expectDayIntake(client, { kcal: 633, protein: 19.6, fat: 23.6, carbs: 88.2 });

  await client.getByRole("link", { name: "今日に戻る" }).click();
  await expect(client.getByRole("heading", { name: "今日の食事" })).toBeVisible();
  await expectDayIntake(client, { kcal: 893, protein: 53.1, fat: 28.1, carbs: 118.3 });
});

test("8・9. 残りの PFC に合わせたコンビニ・外食の組み合わせ", async () => {
  await client.goto("/client/meals");
  await client.getByRole("button", { name: "コンビニで選ぶ" }).click();
  const sheet = client.getByRole("dialog");
  await sheet.getByRole("button", { name: /セブン‐イレブン/ }).click();
  await sheet.getByRole("radio", { name: "夕食" }).click();
  const cards = sheet.locator("article");
  await expect(cards.first()).toBeVisible();
  const first = cards.first();
  const cardText = await first.innerText();
  expect(cardText).toMatch(/目標範囲内|許容範囲に近い|少なめ|一部超過/);
  expect(cardText).toContain("公式情報で確認済み");
  const comboKcal = toNumber(cardText.match(/合計\s*([\d,]+)/)?.[1]);
  expect(comboKcal).toBeGreaterThan(0);
  // 食後の残り = 目標 2,000 − いまの摂取 893 − この組み合わせ
  const remaining = 2000 - 893 - comboKcal;
  if (remaining >= 0) {
    expect(cardText).toMatch(new RegExp(`食後の残り\\s*kcal\\s*${remaining.toLocaleString("ja-JP")}`));
  }
  await expectFitsScreen(client, "組み合わせの提案");

  await first.getByRole("button", { name: "この組み合わせを夕食に記録" }).click();
  // 記録すると残りが変わって候補が入れ替わるので、記録した内容は上のお知らせとトーストで分かるようにしている
  await expect(client.getByText("夕食に記録しました", { exact: true }).first()).toBeVisible();
  const recorded = sheet.getByText(/夕食に記録しました: /);
  await expect(recorded).toBeVisible();
  await expect(sheet.getByText("残りが変わったので、下の候補を今の残りに合わせて更新しました。")).toBeVisible();
  await expect(recorded).toContainText(/7プレミアム|銀しゃりむすび|手巻おにぎり/);

  // 外食: 牛丼（吉野家）の候補が出る。データの無いジャンルは「準備中」
  await sheet.getByRole("tab", { name: /外食チェーン/ }).click();
  await expect(sheet.getByRole("button", { name: /寿司/ })).toBeDisabled();
  await sheet.getByRole("button", { name: /牛丼/ }).first().click();
  await expect(sheet.locator("article").first()).toContainText("吉野家");
  await closeSheet(client);

  const after = await dayIntake(client);
  expect(after.kcal).toBe(893 + comboKcal);
});

test("10・12. トレーナーが記録を見てコメント → クライアントが返信 → 未返信の表示", async () => {
  await trainer.goto("/trainer?view=meals");
  const row = trainer.getByRole("link", { name: new RegExp(CLIENT.name) }).first();
  await expect(row).toContainText("写真2枚");
  await expectFitsScreen(trainer, "トレーナーの食事一覧");
  await row.click();
  await trainer.waitForURL(/tab=meals/);

  const dinner = mealSection(trainer, "夕食");
  await expect(dinner.getByText("鶏の照り焼き")).toBeVisible();
  await expect(dinner.getByText("AI推定を修正")).toBeVisible();
  await expect(dinner.getByText(/AIの推定: 300kcal/)).toBeVisible();
  const photo = dinner.locator("img").first();
  await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expectFitsScreen(trainer, "クライアントの食事タブ");

  await dinner.getByPlaceholder("この食事へのコメント（クライアントに届きます）").fill("照り焼きの量、ちょうどいいですね。");
  await dinner.getByRole("button", { name: "送信" }).click();
  await expect(trainer.getByText("コメントを送りました")).toBeVisible();
  await expect(dinner.getByText("照り焼きの量、ちょうどいいですね。")).toBeVisible();

  await client.goto("/client/meals");
  const clientDinner = mealSection(client, "夕食");
  await expect(clientDinner.getByText("照り焼きの量、ちょうどいいですね。")).toBeVisible();
  await expect(clientDinner.getByText("NEW")).toBeVisible();
  await clientDinner.getByPlaceholder("返信を書く").fill("ありがとうございます！");
  await clientDinner.getByRole("button", { name: "送信" }).click();
  await expect(clientDinner.getByText("ありがとうございます！")).toBeVisible();

  await trainer.goto("/trainer?view=meals");
  await expect(trainer.getByText("未返信 1")).toBeVisible();
  await trainer.getByRole("link", { name: new RegExp(CLIENT.name) }).first().click();
  const trainerDinner = mealSection(trainer, "夕食");
  await expect(trainerDinner.getByText("ありがとうございます！")).toBeVisible();
  await trainerDinner.getByPlaceholder("この食事へのコメント（クライアントに届きます）").fill("引き続きよろしくお願いします。");
  await trainerDinner.getByRole("button", { name: "送信" }).click();
  await expect(trainer.getByText("コメントを送りました")).toBeVisible();
  await trainer.goto("/trainer?view=meals");
  await expect(trainer.getByText(/未返信 \d/)).toHaveCount(0);
});

test("13. ほかのトレーナー・クライアントの記録は見られない", async ({ browser }) => {
  const trainer2 = await newPage(browser);
  await signUp(trainer2, "/signup", TRAINER2, "トレーナーとして登録");
  await trainer2.waitForURL(/\/trainer$/);
  const inviteUrl = await createInviteUrl(trainer2);
  const client2 = await newPage(browser);
  await signUp(client2, inviteUrl, CLIENT2, "登録して始める");
  await client2.waitForURL(/\/client$/);

  // 画面: 別のトレーナーは担当外のクライアントの画面を開けない
  await trainer2.goto("/trainer?view=meals");
  await expect(trainer2.getByText(CLIENT.name)).toHaveCount(0);
  await trainer2.goto(`/trainer/clients/${clientId}?tab=meals`);
  await expect(trainer2.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await expect(trainer2.getByText("鶏の照り焼き")).toHaveCount(0);
  await trainer2.goto(`/trainer/clients/${clientId}/nutrition`);
  await expect(trainer2.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();

  // クライアントはトレーナー用の画面に入れない
  await client.goto("/trainer");
  await expect(client).not.toHaveURL(/\/trainer/);

  // API を直接呼んでも、他人のデータは返らない・書き換えられない（RLS）
  const as = async (email: string) => {
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
    expect(error).toBeNull();
    return db;
  };
  const owner = await as(CLIENT.email);
  const { data: photos } = await owner.from("meal_photos").select("storage_path").limit(1);
  const photoPath = photos?.[0]?.storage_path ?? "";
  expect(photoPath).not.toBe("");
  const { data: ownMeals } = await owner.from("meals").select("id");
  expect((ownMeals ?? []).length).toBeGreaterThan(0);
  const mealId = ownMeals?.[0]?.id ?? "";

  for (const email of [TRAINER2.email, CLIENT2.email]) {
    const other = await as(email);
    const meals = await other.from("meals").select("id").eq("client_id", clientId);
    expect(meals.data ?? []).toEqual([]);
    const items = await other.from("meal_items").select("id").eq("client_id", clientId);
    expect(items.data ?? []).toEqual([]);
    const targets = await other.from("nutrition_targets").select("id").eq("client_id", clientId);
    expect(targets.data ?? []).toEqual([]);
    const signed = await other.storage.from("meal-photos").createSignedUrl(photoPath, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
    const comment = await other
      .from("meal_comments")
      .insert({ meal_id: mealId, client_id: clientId, author_id: (await other.auth.getUser()).data.user?.id ?? "", body: "x" });
    expect(comment.error).not.toBeNull();
    const days = await other.rpc("get_nutrition_days", { p_client_id: clientId, p_from: "2026-01-01", p_to: "2026-01-07" });
    expect(days.data ?? []).toEqual([]);
  }

  // 担当トレーナーは見られる（比較用）
  const own = await as(TRAINER.email);
  const visible = await own.from("meals").select("id").eq("client_id", clientId);
  expect((visible.data ?? []).length).toBeGreaterThan(0);

  // ログインしていない人は何も読めない
  const anon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonMeals = await anon.from("meals").select("id");
  expect(anonMeals.data ?? []).toEqual([]);
  const anonFoods = await anon.from("foods").select("id").limit(1);
  expect(anonFoods.data ?? []).toEqual([]);
});

test("14. スマホのレイアウト: 主な画面が横にはみ出さない", async () => {
  for (const url of ["/client", "/client/meals", "/client/comments", "/client/history"]) {
    await client.goto(url);
    await expectFitsScreen(client, url);
  }
  for (const url of ["/trainer", "/trainer?view=meals", `/trainer/clients/${clientId}?tab=meals`, `/trainer/clients/${clientId}/nutrition`]) {
    await trainer.goto(url);
    await expectFitsScreen(trainer, url);
  }
});
