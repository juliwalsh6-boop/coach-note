# COACH NOTE（仮称）

トレーナーとクライアントが共有して使う、筋トレ記録アプリの MVP です。
スマホ（iPhone の Safari）で片手で操作することを前提に作っています。

- **トレーナー**: クライアントの招待、今日のコンディション一覧、メニュー作成・編集・並べ替え（種目ごとに「全セット同じ」か「セットごとに重量・回数を変える」かを選べます）、トレーニング結果と体調の履歴の確認（目標と違ったセットは差を表示）、コメント、クライアントの削除、記録の削除
- **クライアント**: 朝のチェックイン（睡眠・疲労度・筋肉痛・ストレス・やる気を 1〜10 で入力）、今日のメニューの実施、セットごとの重量・回数の記録、休憩タイマー（音つき）、履歴、トレーナーのコメントの確認、自分の記録の削除
- **ごほうびの演出**: セット完了 → 1種目完了 → トレーニング完了 → 自己ベスト更新の順に、音と演出がだんだん豪華になります。トレーニング完了時は全画面で、紙吹雪・ファンファーレ・総挙上量のカウントアップ・今週の回数・連続週数・自己ベストを表示します
- **食事管理（PFC）**: トレーナーがカロリーと P・F・C の目標を設定し、クライアントは写真（AI 解析）・商品検索・手入力で食事を記録します。残りの PFC に合うコンビニ・外食の組み合わせの提案、食事へのコメントもできます（詳しくは「[食事管理](#食事管理pfc)」）

技術: Next.js 16（App Router）/ TypeScript / Tailwind CSS v4 / Supabase（Auth・PostgreSQL・RLS）/ PWA

---

## セットアップ（本番で使うまで）

所要時間は 15〜20 分ほどです。Supabase と Vercel はどちらも無料プランで動きます。

### 1. Supabase のプロジェクトを作る

1. [supabase.com](https://supabase.com) で新しいプロジェクトを作成します（Region は「Northeast Asia (Tokyo)」がおすすめ）。
2. 左メニューの **SQL Editor** → **New query** を開きます。
3. `supabase/migrations/` の SQL ファイルを、ファイル名の順に 1 つずつ貼り付けて **Run** を押します。
   - `20261025000000_init.sql`（テーブル・アクセス制御（RLS）・関数）
   - `20261026000000_per_set_targets.sql`（セットごとの目標）
   - `20261027000000_remove_client_and_delete_session.sql`（クライアントの削除・記録の削除）
   - `20261029000000_meals.sql`（食事管理: 目標・食事記録・食事写真・コメント・商品データ）
   - `20261029120000_meal_item_indexes.sql`（食事管理: 索引）

   それぞれ「Success. No rows returned」と表示されれば完了です。
4. 続けて `supabase/data/foods.sql`（コンビニ・外食の商品データ）を貼り付けて **Run** します。何度実行しても同じ結果になります。

> Supabase CLI を使う場合は `supabase link --project-ref <プロジェクトID>` → `supabase db push` でも同じ内容が適用されます。

### 2. ログインの設定

**Authentication → Sign In / Providers → Email**

- まず試すだけなら **Confirm email をオフ** にしてください。登録してすぐに使えます。
- 本番運用ではオンを推奨します。オンにする場合は、下の 2 つも設定してください。

**Authentication → URL Configuration**

- Site URL: `https://<あなたのアプリ>.vercel.app`
- Redirect URLs に次の 2 つを追加:
  - `https://<あなたのアプリ>.vercel.app/**`
  - `http://localhost:3000/**`

**Authentication → Email Templates**（Confirm email をオンにする場合）

メール内のリンクを次のように変更すると、登録したのとは別のブラウザ（メールアプリ内のブラウザなど）でリンクを開いても確認できるようになります。

| テンプレート | リンク先 |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |

例: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">メールアドレスを確認する</a>`

### 3. 環境変数

Supabase のダッシュボードの **Project Settings** から、Project URL と **Publishable key**（`sb_publishable_` で始まるキー）をコピーします。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

- ローカルでは `.env.example` をコピーして `.env.local` を作り、上の値を入れます。
- Publishable key が無い古いプロジェクトでは、anon key を `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` に入れても動きます。
- Secret key（service_role key）は使いません。**フロントエンドの環境変数には絶対に入れないでください。**

食事写真の AI 解析を使う場合は、次も設定します（サーバーだけで使う値です。名前に `NEXT_PUBLIC_` を付けないでください）。

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
# 任意: 解析に使うモデル（省略時は claude-sonnet-5-5）
MEAL_ANALYSIS_MODEL=claude-sonnet-5-5
```

- API キーは [Claude Console](https://console.anthropic.com/) の **API Keys** で作成します（従量課金です。利用状況は Console で確認できます）。
- 設定しない場合も、食事の記録（検索・手入力）・組み合わせの提案・コメントはすべて使えます。写真を選ぶと「AI解析はまだ使えません。手入力で記録できます」と表示され、写真を付けて手入力で記録できます。
- `ANTHROPIC_BASE_URL`（任意）を設定すると、Messages API の送り先を変えられます（社内プロキシや自動テスト用のモック向け。通常は設定しません）。

### 4. ローカルで動かす

Node.js 20.9 以上が必要です。

```bash
npm install
npm run dev
```

http://localhost:3000 を開きます。

### 5. Vercel に公開する

1. このフォルダを GitHub のリポジトリにアップロードします。
2. Vercel で **Add New → Project** → そのリポジトリを選びます（Framework は自動で Next.js になります）。
3. **Environment Variables** に手順 3 の 2 つを入れて **Deploy**。
4. 公開された URL を、手順 2 の Site URL / Redirect URLs に設定します。

### 6. 使い始める

1. `/signup` から **トレーナー登録** をします。
2. 下のメニューの **招待** → 「招待リンクを作成」→ LINE などでクライアントに送ります（1 リンク 1 人、有効期限 14 日）。
3. クライアントがリンクを開いて登録すると、自動であなたの担当になります。
   すでにアカウントを持っているクライアントも、ログインした状態で招待リンクを開けばつながれます（担当トレーナーがいない間は、ホーム画面で招待コードを入力することもできます）。
4. iPhone では Safari で開き、共有ボタン →「ホーム画面に追加」でアプリのように全画面で使えます。

---

## 食事管理（PFC）

### できること

**クライアント**（下のメニューの「食事」）

- 今日の目標・摂取量・残りのカロリーと P・F・C（目標 ± 許容範囲に入っているか、超えた分は「超過」と表示）
- 朝食・昼食・夕食・間食ごとの記録。量の変更・削除、過去の日の表示と記録、過去の食事を「もう一度記録」
- **写真で記録**: 写真を撮る／選ぶ → 端末で縮小（長い辺 1568px）→ AI が料理ごとに分けて量と栄養値を推定 → 内容・量・値を直してから保存（確認するまでは保存しません）。同じ写真を二度記録しそうなときは注意を出します。AI がエラーのときは、写真を付けたまま手入力に切り替えられます
- **検索して追加**: コンビニ・外食チェーンの商品、食材（日本食品標準成分表）を名前で検索（ひらがな/カタカナ・全角/半角の違いは無視）
- **残りに合わせて選ぶ**: お店（セブン‐イレブン・ファミリーマート・ローソン）やジャンル（牛丼・定食・ファストフード など）を選ぶと、残りの P・F・C に合う組み合わせを提案。「目標範囲内」「許容範囲に近い」「少なめ」「一部超過」と、食後の残り・1 日の目標を超える量・出典・参考価格を表示し、ワンタップで記録できます
- トレーナーからの食事へのコメントに返信

**トレーナー**

- ホームの「食事」タブ: 担当クライアントごとの目標・その日の摂取量・記録の有無（食事数・品数・写真の数）・最終記録日時・体重・未返信のコメント
- クライアント詳細の「食事」タブ: 1 日の記録（写真・1 品ごとの PFC・AI の推定値と修正の有無）、目標との比較、直近 7 日の摂取量・体重・トレーニング、食事へのコメント
- 「目標を設定」: カロリー・P・F・C・許容範囲・メモを **適用開始日つき** で保存。過去の日の目標と記録は書き換わりません（履歴として残ります）。まだ始まっていない予定の目標は編集・削除できます

### 計算のルール

- 1 品の値 = 基準量あたりの値 × 食べた量 ÷ 基準量（先に掛けてから割る）。カロリーは整数、P・F・C は小数第 1 位で 1 品ごとに保存し、食事・1 日の合計はその合計です（画面と DB の集計で同じ値になります）
- 計算は DB のトリガーで行います（画面から送られた合計値は使いません）。商品データの「1食あたり」「100gあたり」の違いもここで換算します
- 記録した時点の値を保存するので、あとで商品データを更新しても過去の記録は変わりません
- 提案の目安 = 1 日の残り × その食事の配分（朝 25%・昼 35%・夕 35%・間食 5% を、まだ記録していない食事で分ける）。計算は `src/lib/nutrition/suggest.ts`（単体テストあり）

### 商品データ（コンビニ・外食）

- `supabase/data/foods.sql` に、**公式サイト・公式資料で確認できた商品だけ** を出典 URL・確認日（2026-10-29）・基準量の注記つきで登録しています（セブン‐イレブン 11 品、ローソン 7 品、ファミリーマート 14 品、マクドナルド 5 品、吉野家 5 品、やよい軒 3 品、食材 2 品）。推測した値は入れていません
- データが確認できなかったお店・ジャンル（寿司・ファミレスなど）は、画面で「準備中」と表示されます
- **更新のしかた**: 公式ページで確認して `foods.sql` の値と `verified_on`（確認日）を書き換え、SQL Editor で実行します（`code` が同じ行は上書き）。販売終了は `availability` を `'discontinued'`、情報が古いかもしれないときは `'needs_review'` にします。行は削除しないでください
- **追加のしかた**: 同じ形で行を追加します。`verification_status = 'verified'` にできるのは、公式情報（`official_web` / `package_label` / `standard_table`）で出典と確認日があるものだけです（DB の制約で確認します）。サンプル・未確認のデータは提案に使われません
- 転記ミスの検出: `npm run test:db` は、エネルギーが P・F・C から計算した値（4・9・4 kcal/g）と大きく違う商品があると失敗します
- 商品情報の自動取得（スクレイピング）はしていません。各社の利用規約を確認のうえ、手作業で更新してください

### 写真とプライバシー

- 写真は非公開の Storage バケット `meal-photos` に、クライアントごとのフォルダで保存します。表示は期限 1 時間の署名付き URL で、本人と担当トレーナーだけが見られます（Storage のポリシーでも制限）
- 画像は JPEG / PNG / WebP のみ（中身のバイト列で判定）、1 枚 5MB まで。AI 解析はクライアント 1 人あたり 24 時間で 40 回まで
- AI の API キーはサーバーの環境変数だけで使い、ブラウザには渡しません。AI の応答は形式と値の範囲を検証してから表示します

---

## データの見え方（セキュリティ）

アクセス制御は **画面側ではなくデータベース側（Supabase RLS）** で行っています。画面に出さないだけでなく、API を直接呼ばれても他人のデータは返りません。

- クライアントが見られるのは **自分のデータだけ** です（Client A は Client B のデータを見られません）。
- トレーナーが見られるのは **自分が担当しているクライアントのデータだけ** です。担当関係は招待リンクでのみ作られます。
- ログインしていないユーザーは、どのテーブルにもアクセスできません（招待リンクの確認だけ可能）。
- トレーナーがクライアントを削除すると、担当関係が「終了（archived）」になり、トレーナーからはそのクライアントのデータが一切見えなくなります。クライアントからも、そのトレーナーのメニューは見えなくなります。データ自体は消さないので、新しい招待リンクでつなぎ直すと元どおりになります。
- トレーニング記録を削除できるのは、本人と担当トレーナーだけです（セットもまとめて削除。コメントは残ります）。
- クライアントが書き換えられるのは、自分のチェックインと、セットの実績（重量・回数）だけです。目標値・メニュー・コメントは変更できません（列単位で権限を制限）。
- すべてのテーブルで RLS を有効化し、`anon` / `authenticated` への権限も明示的に付与しています（2026 年以降の Supabase では新しいテーブルが自動で API 公開されないため）。
- 食事の記録・写真は本人だけが追加・変更・削除でき、担当トレーナーは閲覧とコメントだけができます。栄養目標を設定できるのは担当トレーナーだけで、過去の日付の目標は変更できません。

### RLS のテスト（任意）

`supabase/tests/rls_test.sql` に、他人のデータが見えない・書き換えられないことを確かめるテストがあります（セットごとの目標の検証を含みます）。PostgreSQL 16 で次のように実行できます（最後に ROLLBACK するのでデータは残りません）。

```bash
createdb coach_test
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/tests/supabase_shim.sql
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000000_init.sql
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261026000000_per_set_targets.sql
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261027000000_remove_client_and_delete_session.sql
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

`supabase_shim.sql` は、素の PostgreSQL に Supabase と同じロール（anon / authenticated）と `auth.uid()` を用意するためのファイルです。

---

## コンディション表示について

トレーナーのホームの「コンディション良好」「注意」「疲労高め」は、5 項目の平均と、疲労・筋肉痛などの高さから自動で出している **目安** です。医学的な判断ではなく、トレーニングの中止なども自動では行いません。判定ルールは `src/lib/condition.ts` にまとまっています。

| 表示 | 条件（いずれか） |
| --- | --- |
| 疲労高め | 疲労度 8 以上 / 筋肉痛 8 以上 / 総合スコア 4 以下 |
| 注意 | 総合スコア 5.5 未満 / 睡眠 3 以下 / やる気 3 以下 / ストレス 8 以上 / 疲労度・筋肉痛 7 以上 |
| コンディション良好 | 上記に当てはまらない |

総合スコア = 睡眠・やる気はそのまま、疲労度・筋肉痛・ストレスは「11 − 値」にして、5 つを平均したもの（10 が最も良い）。

---

## カスタマイズ

| 変えたいもの | 場所 |
| --- | --- |
| アプリ名 | `src/lib/config.ts` の `APP_NAME`（タイトル・ホーム画面のアプリ名に反映） |
| アイコン | `src/app/icon.png`, `src/app/apple-icon.png`, `src/app/favicon.ico`, `public/icons/` |
| 効果音 | `public/sounds/` のファイルを同じ名前で置き換え（mp3 にする場合は `src/lib/audio/sounds.ts` のパスも変更） |
| どの場面でどの音を鳴らすか | `src/lib/audio/cues.ts` の `CUE_SOUNDS` |
| 完了画面の演出 | `src/components/workout/workout-celebration.tsx`（紙吹雪は `src/components/celebration/confetti.tsx`） |
| 自己ベスト・連続週数の判定 | `src/lib/records.ts` |
| 音声ガイドの読み上げ文 | `src/lib/audio/voice.ts`（アカウント画面でオンにすると使えます。試験中の機能） |
| 休憩時間の選択肢 | `src/components/plans/plan-editor.tsx` の `REST_OPTIONS` |
| 種目名の候補 | `src/lib/exercises.ts` |
| 色・フォント | `src/app/globals.css` の `@theme` |

| ファイル | 鳴る場面 |
| --- | --- |
| `set-complete.wav` | セット完了 |
| `exercise-complete.wav` | 1種目のセットをすべて完了・朝のチェックイン完了 |
| `rest-warning.wav` | 休憩の残り 10 秒 |
| `countdown-tick.wav` | 休憩の残り 3・2・1 秒 |
| `rest-end.wav` | 休憩終了 |
| `workout-charge.wav` | トレーニング完了の直前の「溜め」（だんだん速くなる振動つき） |
| `workout-complete.wav` | トレーニング完了の「ギャン！」→「でーん！」（強い振動つき） |
| `personal-record.wav` | 自己ベスト更新 |

iPhone はブラウザの制限で、画面を一度タップするまで音を出せないため、タップしたときに音の再生を準備しています。端末の「視差効果を減らす（動きを減らす）」がオンの場合、紙吹雪などの動きは省略されます。

振動は Android では Vibration API を使います。iPhone の Safari には振動の API がないため、スイッチを切り替えたときの触覚フィードバック（iOS 17.4 以降）を代わりに使っています（`src/lib/haptics.ts`）。環境によっては振動しないことがあります。

---

## ファイル構成

```
supabase/
  migrations/             テーブル・RLS・関数・権限（ファイル名の順に実行）
  data/foods.sql          コンビニ・外食の商品データ（出典・確認日つき）
  tests/                  RLS・食事管理のテスト（npm run test:db）
e2e/                      画面を通した動作確認（Playwright。GitHub Actions の e2e ジョブで実行）
src/
  proxy.ts                ログイン状態の更新と、未ログイン時のリダイレクト（Next.js 16 の proxy）
  app/
    login, signup, forgot-password, auth/   ログイン・登録・パスワード再設定
    join/[code]/          招待リンク
    trainer/              トレーナーの画面（ホーム・招待・クライアント詳細・メニュー作成・結果）
    client/               クライアントの画面（ホーム・食事・トレーニング記録・履歴・コメント・アカウント）
    api/meals/analyze/    食事写真の AI 解析（サーバー側で Claude API を呼ぶ）
    manifest.ts           PWA の設定
  components/             画面の部品（checkin, workout, plans, history, comments, trainer, meals, ui …）
  hooks/                  休憩タイマー、画面スリープ防止など
  lib/
    data/                 データの取得・保存（Supabase を呼ぶのはここだけ）
    audio/                効果音・音声ガイド
    supabase/             Supabase クライアントの作成
    condition.ts          コンディション表示のルール
    nutrition/            PFC の計算・集計・組み合わせの提案・入力チェック（単体テストあり）
    ai/meal-analysis.ts   食事写真の AI 解析（サーバー専用）
    images/               画像の縮小・形式の判定
  types/database.ts       データベースの型定義
public/
  sounds/                 効果音
  icons/                  ホーム画面用アイコン
  sw.js                   Service Worker（画面の部品だけキャッシュ。データはキャッシュしない）
```

## 開発用コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm start` | 本番ビルド / 起動 |
| `npm run typecheck` | 型チェック |
| `npm run lint` | ESLint |
| `npm test` | 単体テスト（PFC の計算・提案・入力チェック・AI 応答の検証など） |
| `npm run test:db` | DB のテスト（RLS・食事管理・商品データ。PostgreSQL 16 が必要。`PGHOST` / `PGUSER` で接続先を指定） |

GitHub に push すると、`.github/workflows/build.yml` が型チェック・lint・単体テスト・本番ビルド・DB のテストと、ローカルの Supabase に対する E2E テスト（`e2e/`）を自動で実行します。結果は GitHub の「Actions」タブで確認できます。

E2E を手元で動かす場合（Docker と Supabase CLI が必要）:

```bash
supabase init && supabase start          # ローカルの Supabase（マイグレーションも適用される）
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/data/foods.sql
# .env.local にローカルの API URL と anon key を入れてから
npm run build
ANTHROPIC_API_KEY=e2e-test-key ANTHROPIC_BASE_URL=http://127.0.0.1:4010 npx next start -p 3000 &
node e2e/mock-anthropic.mjs &
npm install --no-save @playwright/test && npx playwright install chromium
npx playwright test -c e2e/playwright.config.ts
```

型定義 `src/types/database.ts` は手書きですが、Supabase CLI の `supabase gen types typescript` と同じ形式なので、テーブルを追加したときは生成し直して置き換えられます。

---

## 今後の拡張に向けた設計メモ

- **目標と実績を分けて保存**: `set_logs` に目標（`target_*`）と実績（`actual_*`）を別々に持たせています。RPE 用の列（`rpe`）も用意済みです。
- **セットごとの目標**: メニューの種目は `plan_exercises.set_targets` に `[{"weight_kg": 60, "reps": 10}, ...]` の形でセットごとの目標を持ちます（形式は DB の CHECK 制約で検証）。トレーニング開始時に各セットの `set_logs.target_*` へコピーされます。RPE やセットの種類（ウォームアップなど）を足すときも、この配列の項目を増やすだけで済みます。
- **種目ごとの推移**: 種目名を正規化した `exercise_key`（全角/半角・大文字小文字の違いを吸収）で、同じ種目の記録をまとめて取り出せます。重量の推移グラフなどに使えます。
- **体調とトレーニングの関係**: `checkins.checkin_date` と `workout_sessions.performed_date` を日付で結合すれば、「睡眠とパフォーマンス」「疲労度とボリューム」「体重の推移」などを出せます。
- **メニューを変えても過去の記録は変わらない**: トレーニング開始時にメニューの内容をコピーして記録するため、あとでメニューを編集・削除しても過去の結果はそのまま残ります。

例: 種目ごとの最大重量の推移（Supabase の SQL Editor で実行）

```sql
select ws.performed_date, se.name, max(sl.actual_weight_kg) as max_kg
from set_logs sl
join session_exercises se on se.id = sl.session_exercise_id
join workout_sessions ws on ws.id = sl.session_id
where sl.completed_at is not null and se.exercise_key = 'ベンチプレス'
group by ws.performed_date, se.name
order by ws.performed_date;
```

## 既知の制限

- 通信が切れている間の記録はできません（保存に失敗したことを画面に表示します）。
- iPhone はマナーモード（消音）中だと効果音が鳴らないことがあります。
- 誰でもトレーナーとして登録できます。限定したい場合は、Supabase の Authentication の設定で新規登録を止め、トレーナーのアカウントは管理画面から作成してください。
- プッシュ通知、グラフ表示、トレーナー同士でのクライアント共有は未実装です。
- アカウントそのものの削除（退会）は画面からはできません。必要な場合は Supabase の Authentication → Users から削除してください（そのユーザーの記録もすべて削除されます）。
- 自己ベストは「同じ種目名（全角/半角・大文字小文字の違いは同一扱い）」の過去の記録と比べています。種目名を変えると別の種目として扱われます。
- 食事の AI 解析は推定値です（量・油・調味料は写真だけでは正確に分かりません）。保存前に必ず内容を確認・修正する作りにしています。
- 商品データは登録した店舗・商品だけです（寿司・ファミレスなどは未登録で「準備中」）。地域限定・季節限定の商品や価格の地域差があります。販売終了の確認は手作業です。
- 食事の記録・目標は「1 日（日本時間）」単位です。日付をまたぐ夜食などは、記録する日を選んでください。
