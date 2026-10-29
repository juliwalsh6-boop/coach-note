import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isMissingSchemaError, toErrorMessage } from "./errors";

describe("errors", () => {
  test("テーブル・関数が無いエラーを見分ける（マイグレーション適用前）", () => {
    assert.equal(isMissingSchemaError({ code: "PGRST205", message: "Could not find the table 'public.meals'" }), true);
    assert.equal(isMissingSchemaError({ code: "PGRST202", message: "Could not find the function" }), true);
    assert.equal(isMissingSchemaError({ code: "42P01", message: 'relation "public.meals" does not exist' }), true);
    assert.equal(isMissingSchemaError({ code: "42501", message: "permission denied" }), false);
    assert.equal(isMissingSchemaError(new Error("x")), false);
    assert.equal(isMissingSchemaError(null), false);
    assert.match(toErrorMessage({ code: "PGRST205", message: "x" }), /データベースの更新が必要/);
  });

  test("食事管理の DB エラーは日本語の案内になる", () => {
    assert.match(toErrorMessage({ code: "22023", message: "invalid_target_date" }), /適用開始日/);
    assert.match(toErrorMessage({ code: "P0001", message: "analysis_quota_exceeded" }), /40回/);
    assert.match(toErrorMessage("ai_not_configured"), /手入力/);
  });
});
