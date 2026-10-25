# COACH NOTE（仮称）

トレーナーとクライアントが共有して使う、筋トレ記録アプリの MVP です。
スマホ（iPhone の Safari）で片手で操作することを前提に作っています。

- **トレーナー**: クライアントの招待、今日のコンディション一覧、メニュー作成・編集・並べ替え、トレーニング結果と体調の履歴の確認、コメント
- **クライアント**: 朝のチェックイン（睡眠・疲労度・筋肉痛・ストレス・やる気を 1〜10 で入力）、今日のメニューの実施、セットごとの重量・回数の記録、休憩タイマー（音つき）、履歴、トレーナーのコメントの確認
- **ごほうびの演出**: セット完了 → 1種目完了 → トレーニング完了 → 自己ベスト更新の順に、音と演出がだんだん豪華になります。トレーニング完了時は全画面で、紙吹雪・ファンファーレ・総挙上量のカウントアップ・今週の回数・連続週数・自己ベストを表示します

技術: Next.js 16（App Router）/ TypeScript / Tailwind CSS v4 / Supabase（Auth・PostgreSQL・RLS）/ PWA

---

## セットアップ（本番で使うまで）

所要時間は 15〜20 分ほどです。Supabase と Vercel はどちらも無料プランで動きます。

### 1. Supabase のプロジェクトを作る

1. [supabase.com](https://supabase.com) で新しいプロジェクトを作成します（Region は「Northeast Asia (Tokyo)」がおすすめ）。
2. 左メニューの **SQL Editor** → **New query** を開きます。
3. `supabase/migrations/20261025000000_init.sql` の中身をすべて貼り付けて **Run** を押します。
   「Success. No rows returned」と表示されれば完了です。テーブル・アクセス制御（RLS）・関数がまとめて作られます。

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

## データの見え方（セキュリティ）

アクセス制御は **画面側ではなくデータベース側（Supabase RLS）** で行っています。画面に出さないだけでなく、API を直接呼ばれても他人のデータは返りません。

- クライアントが見られるのは **自分のデータだけ** です（Client A は Client B のデータを見られません）。
- トレーナーが見られるのは **自分が担当しているクライアントのデータだけ** です。担当関係は招待リンクでのみ作られます。
- ログインしていないユーザーは、どのテーブルにもアクセスできません（招待リンクの確認だけ可能）。
- クライアントが書き換えられるのは、自分のチェックインと、セットの実績（重量・回数）だけです。目標値・メニュー・コメントは変更できません（列単位で権限を制限）。
- すべてのテーブルで RLS を有効化し、`anon` / `authenticated` への権限も明示的に付与しています（2026 年以降の Supabase では新しいテーブルが自動で API 公開されないため）。

### RLS のテスト（任意）

`supabase/tests/rls_test.sql` に、他人のデータが見えない・書き換えられないことを確かめるテストが 134 項目あります。PostgreSQL 16 で次のように実行できます（最後に ROLLBACK するのでデータは残りません）。

```bash
createdb coach_test
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/tests/supabase_shim.sql
psql -d coach_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000000_init.sql
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
  migrations/20261025000000_init.sql  テーブル・RLS・関数・権限（これ 1 つで DB が完成）
  tests/                               RLS のテスト
src/
  proxy.ts                ログイン状態の更新と、未ログイン時のリダイレクト（Next.js 16 の proxy）
  app/
    login, signup, forgot-password, auth/   ログイン・登録・パスワード再設定
    join/[code]/          招待リンク
    trainer/              トレーナーの画面（ホーム・招待・クライアント詳細・メニュー作成・結果）
    client/               クライアントの画面（ホーム・トレーニング記録・履歴・コメント・アカウント）
    manifest.ts           PWA の設定
  components/             画面の部品（checkin, workout, plans, history, comments, trainer, ui …）
  hooks/                  休憩タイマー、画面スリープ防止など
  lib/
    data/                 データの取得・保存（Supabase を呼ぶのはここだけ）
    audio/                効果音・音声ガイド
    supabase/             Supabase クライアントの作成
    condition.ts          コンディション表示のルール
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

型定義 `src/types/database.ts` は手書きですが、Supabase CLI の `supabase gen types typescript` と同じ形式なので、テーブルを追加したときは生成し直して置き換えられます。

---

## 今後の拡張に向けた設計メモ

- **目標と実績を分けて保存**: `set_logs` に目標（`target_*`）と実績（`actual_*`）を別々に持たせています。RPE 用の列（`rpe`）も用意済みです。
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
- 自己ベストは「同じ種目名（全角/半角・大文字小文字の違いは同一扱い）」の過去の記録と比べています。種目名を変えると別の種目として扱われます。
