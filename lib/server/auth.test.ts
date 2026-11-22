import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPassword, COOKIE_NAME, createSessionToken, isAuthenticated, verifySessionToken } from "./auth.ts";

process.env.APP_PASSWORD = "correct horse";
delete process.env.SESSION_SECRET;

test("checkPassword", () => {
  assert.equal(checkPassword("correct horse"), true);
  assert.equal(checkPassword("wrong"), false);
  assert.equal(checkPassword(""), false);
});

test("session tokens expire and are tied to the password", () => {
  const now = Date.UTC(2026, 10, 22);
  const t = createSessionToken(now);
  assert.equal(verifySessionToken(t, now), true);
  assert.equal(verifySessionToken(t, now + 31 * 86400_000), false);
  assert.equal(verifySessionToken(t.replace(/.$/, (c) => (c === "0" ? "1" : "0")), now), false);
  assert.equal(verifySessionToken("123.abc", now), false);
  assert.equal(verifySessionToken(undefined, now), false);

  process.env.APP_PASSWORD = "new password";
  assert.equal(verifySessionToken(t, now), false);
  process.env.APP_PASSWORD = "correct horse";
});

test("isAuthenticated reads the cookie", () => {
  const t = createSessionToken();
  const req = new Request("https://x/api/books", { headers: { cookie: `a=1; ${COOKIE_NAME}=${t}` } });
  assert.equal(isAuthenticated(req), true);
  assert.equal(isAuthenticated(new Request("https://x/api/books")), false);
});
