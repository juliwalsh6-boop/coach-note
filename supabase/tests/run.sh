#!/usr/bin/env bash
# ローカル / CI 用: 新しいデータベースを作り、シム → マイグレーション → テストの順に実行する。
#   PGHOST / PGUSER などは環境変数で指定（例: PGHOST=localhost PGUSER=postgres bash supabase/tests/run.sh）
# 失敗したら 0 以外で終了する。
set -euo pipefail

cd "$(dirname "$0")/../.."

DB="${TEST_DB:-coach_test}"
# マイグレーションの「存在しないのでスキップ」などの NOTICE は表示しない
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"

psql -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_shim.sql >/dev/null
for f in supabase/migrations/*.sql; do
  echo "migrate: $f"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
for f in supabase/tests/rls_test.sql supabase/tests/meals_test.sql; do
  echo "test: $f"
  out="$(PGOPTIONS="-c client_min_messages=notice" psql -d "$DB" -v ON_ERROR_STOP=1 -f "$f" 2>&1)" || { echo "$out" | grep -v '^NOTICE:  ok - ' | tail -n 20; exit 1; }
  echo "  $(echo "$out" | grep -c 'NOTICE:  ok - ') assertions passed"
  echo "$out" | grep -q 'ALL TESTS PASSED'
done

# 商品データが DB の制約（出典・確認日・基準量など）を満たして読み込めることを確かめる（2 回流しても同じ結果になること）
for f in supabase/data/*.sql; do
  [ -e "$f" ] || continue
  echo "data: $f"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  first="$(psql -d "$DB" -tA -c "select count(*) from public.foods")"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  second="$(psql -d "$DB" -tA -c "select count(*) from public.foods")"
  [ "$first" = "$second" ] || { echo "  data file is not idempotent ($first -> $second rows)"; exit 1; }
  echo "  $second foods loaded"
done

# 転記ミスの検出: エネルギーが P・F・C から計算した値（4・9・4 kcal/g）と大きく違う商品が無いこと
bad="$(psql -d "$DB" -tA -c "
  select code || ' (' || energy_kcal || ' kcal vs ' || round(4 * protein_g + 9 * fat_g + 4 * carbs_g, 1) || ')'
  from public.foods
  where code is not null
    and abs(energy_kcal - (4 * protein_g + 9 * fat_g + 4 * carbs_g)) > greatest(15, energy_kcal * 0.08)")"
[ -z "$bad" ] || { echo "  energy does not match P/F/C:"; echo "$bad"; exit 1; }

dropdb "$DB"
echo "SQL tests: ALL PASSED"
