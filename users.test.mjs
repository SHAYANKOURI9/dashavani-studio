import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { userStore } from "./users.mjs";

const fresh = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "users-")), "users.json");
  return { file, users: userStore(file, "test-secret") };
};

test("the first account is the owner; later ones wait for approval", () => {
  const { users } = fresh();
  const owner = users.signUp("Owner@Example.com ", "longpassword").user;
  assert.deepEqual([owner.email, owner.role, owner.status], ["owner@example.com", "owner", "approved"]);
  const ed = users.signUp("ed@example.com", "longpassword").user;
  assert.deepEqual([ed.role, ed.status], ["editor", "pending"]);
  assert.match(users.signIn("ed@example.com", "longpassword").error, /approval/);
  assert.equal(users.setStatus(ed.id, "approved"), null);
  assert.equal(users.signIn("ED@example.com", "longpassword").user.id, ed.id);
  assert.equal(users.setStatus(owner.id, "removed"), "No such account", "the owner can't be removed");
  assert.match(users.signUp("ed@example.com", "longpassword").error, /already exists/);
  assert.match(users.signUp("not-an-email", "longpassword").error, /email/);
  assert.match(users.signUp("x@example.com", "short").error, /8 characters/);
});

test("wrong passwords: one answer for every failure, and a lock after five", () => {
  const { users } = fresh();
  users.signUp("o@example.com", "longpassword");
  const nobody = users.signIn("nobody@example.com", "longpassword").error;
  assert.equal(users.signIn("o@example.com", "wrong-pass").error, nobody, "an unknown email and a wrong password look the same");
  for (let i = 0; i < 4; i++) users.signIn("o@example.com", "wrong-pass", 1000);
  assert.match(users.signIn("o@example.com", "longpassword", 2000).error, /Too many/, "locked even with the right password");
  assert.ok(users.signIn("o@example.com", "longpassword", 2000 + 16 * 60_000).user, "unlocked after 15 minutes");
});

test("nothing secret is stored or shown in the clear; only the owner gets .env.local keys", () => {
  const { file, users } = fresh();
  const owner = users.signUp("o@example.com", "longpassword").user;
  const ed = users.signUp("e@example.com", "longpassword").user;
  assert.equal(users.setKeys(ed.id, { GEMINI_API_KEY: "AIza-editor-own-key", NOT_A_KEY: "x" }), null);
  const raw = fs.readFileSync(file, "utf8");
  assert.ok(!raw.includes("longpassword") && !raw.includes("AIza-editor-own-key"), "no plain password or key on disk");
  const env = { GEMINI_API_KEY: "AIza-owner", ELEVENLABS_API_KEY: "el-owner" };
  assert.equal(users.keysFor(users.find(owner.id), env).GEMINI_API_KEY, "AIza-owner");
  assert.deepEqual(users.keysFor(users.find(ed.id), env), { GEMINI_API_KEY: "AIza-editor-own-key" }, "an editor never gets the owner's keys");
  assert.deepEqual(users.keysFor(null, env), {});
  assert.deepEqual(users.pub(users.find(ed.id)).keys, ["GEMINI_API_KEY"], "the browser learns which keys are saved, not what they are");
  assert.equal(users.setKeys(ed.id, { GEMINI_API_KEY: "" }), null);
  assert.deepEqual(users.keysFor(users.find(ed.id), env), {}, "an empty value removes a key");
});

test("forgot password: a one-time link that lasts an hour, stored only as a hash", () => {
  const { file, users } = fresh();
  users.signUp("o@example.com", "longpassword");
  assert.equal(users.startReset("nobody@example.com", 0), null, "no account: nothing sent");
  const r = users.startReset(" O@Example.com", 1000);
  assert.equal(r.email, "o@example.com");
  assert.ok(!fs.readFileSync(file, "utf8").includes(r.token), "the users file holds only the token's hash");
  assert.equal(users.startReset("o@example.com", 30_000), null, "one email a minute");
  assert.match(users.finishReset("wrong-token", "newpassword1", 2000).error, /expired/);
  assert.match(users.finishReset(r.token, "short", 2000).error, /8 characters/);
  assert.match(users.finishReset(r.token, "newpassword1", 1000 + 61 * 60_000).error, /expired/, "after an hour");
  assert.ok(users.finishReset(r.token, "newpassword1", 2000).user);
  assert.match(users.finishReset(r.token, "another-pass", 3000).error, /already used/, "works once");
  assert.ok(users.signIn("o@example.com", "newpassword1").user);
  assert.ok(users.signIn("o@example.com", "longpassword").error, "the old password stops working");
});
