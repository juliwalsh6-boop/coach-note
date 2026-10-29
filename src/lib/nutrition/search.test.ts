import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { escapeLikePattern, normalizeSearchText, searchTerms } from "./search";

describe("normalizeSearchText（DB の normalize_search_text と同じ規則）", () => {
  test("半角カナ・全角英数・全角スペース", () => {
    assert.equal(normalizeSearchText("ｻﾗﾀﾞﾁｷﾝ　ＰＬＡＩＮ"), "サラダチキン plain");
  });
  test("ひらがなはカタカナに揃える", () => {
    assert.equal(normalizeSearchText("さらだ　ちきん"), "サラダ チキン");
    assert.equal(normalizeSearchText("ぎゅうどん"), "ギュウドン");
  });
  test("前後と連続する空白", () => {
    assert.equal(normalizeSearchText("  鮭   おにぎり "), "鮭 オニギリ");
  });
});

describe("escapeLikePattern / searchTerms", () => {
  test("% _ \\ をエスケープ", () => {
    assert.equal(escapeLikePattern("100%_a\\b"), "100\\%\\_a\\\\b");
  });
  test("空白で区切って最大 4 語", () => {
    assert.deepEqual(searchTerms("鮭 おにぎり  セブン"), ["鮭", "オニギリ", "セブン"]);
    assert.deepEqual(searchTerms("a b c d e f"), ["a", "b", "c", "d"]);
    assert.deepEqual(searchTerms("   "), []);
  });
});
