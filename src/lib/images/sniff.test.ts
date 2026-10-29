import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sniffImageType } from "./sniff";

describe("sniffImageType（中身で画像形式を判定）", () => {
  test("JPEG / PNG / WebP", () => {
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])), "image/jpeg");
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), "image/png");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56]);
    assert.equal(sniffImageType(webp), "image/webp");
  });
  test("画像でないもの・偽装したもの・空", () => {
    assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns=...")), null);
    assert.equal(sniffImageType(new TextEncoder().encode("%PDF-1.7")), null);
    assert.equal(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null); // GIF は受け付けない
    assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null); // WAV
    assert.equal(sniffImageType(new Uint8Array([])), null);
  });
});
