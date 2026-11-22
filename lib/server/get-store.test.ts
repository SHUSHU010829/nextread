import { test } from "node:test";
import assert from "node:assert/strict";
import { findBlobAuth } from "./get-store.ts";

test("findBlobAuth", () => {
  assert.deepEqual(findBlobAuth({ BLOB_READ_WRITE_TOKEN: "t" }), { token: "t" });
  assert.deepEqual(findBlobAuth({ BLOB_STORE_ID: "store_1" }), { storeId: "store_1" });
  assert.deepEqual(findBlobAuth({ BLOB_STORE_ID: "s", BLOB_READ_WRITE_TOKEN: "t" }), { token: "t" });
  assert.deepEqual(findBlobAuth({ NEXTREAD_READ_WRITE_TOKEN: "vercel_blob_rw_abc" }), { token: "vercel_blob_rw_abc" });
  assert.deepEqual(findBlobAuth({ NEXTREAD_STORE_ID: "store_abc" }), { storeId: "store_abc" });
  assert.equal(findBlobAuth({ SHOP_STORE_ID: "12345" }), null);
  assert.equal(findBlobAuth({ VERCEL: "1", BLOB_READ_WRITE_TOKEN: "" }), null);
});
