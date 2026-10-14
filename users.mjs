// Studio accounts, in one JSON file. The first account is the owner and uses the API keys in .env.local;
// everyone after that waits for the owner's approval and brings their own keys, so nobody spends the owner's money.
// Passwords are scrypt hashes; saved API keys are encrypted (AES-256-GCM) with a key made from the server secret.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// What a non-owner must bring to make videos. The owner's come from .env.local.
export const KEY_NAMES = ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "HEYGEN_API_KEY", "HEYGEN_AVATAR_ID"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCK_AFTER = 5, LOCK_MS = 15 * 60_000;
const RESET_MS = 60 * 60_000, RESET_GAP_MS = 60_000; // a reset link lasts an hour; one email a minute per account
const badPassword = (p) => (typeof p !== "string" || p.length < 8 || p.length > 200 ? "Use a password of at least 8 characters" : null);
const sha = (s) => createHash("sha256").update(s).digest("base64url");

const hash = (password, salt) => scryptSync(password, salt, 64).toString("base64url");

export function userStore(file, secret) {
  const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []);
  const write = (users) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const box = createHash("sha256").update(`dashavani-keys:${secret}`).digest();
  const seal = (obj) => {
    const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", box, iv);
    const data = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
    return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
  };
  const open = (sealed) => {
    const [iv, tag, data] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", box, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString());
  };
  const failures = new Map(); // email -> { n, until }; in memory, so a restart clears it
  // What the browser may see: never the hash or the keys themselves.
  const pub = (u) => u && { id: u.id, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt, keys: KEY_NAMES.filter((k) => u.keys && open(u.keys)[k]) };

  return {
    pub,
    find: (id) => read().find((u) => u.id === id) ?? null,
    list: () => read().map(pub),
    // Returns { user } or { error }.
    signUp(email, password) {
      email = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (!EMAIL.test(email) || email.length > 200) return { error: "Enter a valid email address" };
      if (badPassword(password)) return { error: badPassword(password) };
      const users = read();
      if (users.some((u) => u.email === email)) return { error: "An account with that email already exists; sign in instead" };
      const salt = randomBytes(16).toString("base64url");
      const owner = users.length === 0;
      const user = { id: randomUUID(), email, salt, hash: hash(password, salt), role: owner ? "owner" : "editor", status: owner ? "approved" : "pending", createdAt: new Date().toISOString() };
      write([...users, user]);
      return { user };
    },
    // Returns { user } or { error }. The same words for an unknown email and a wrong password.
    signIn(email, password, now = Date.now()) {
      email = typeof email === "string" ? email.trim().toLowerCase() : "";
      const f = failures.get(email);
      if (f?.until > now) return { error: "Too many wrong tries. Wait 15 minutes and try again" };
      const user = read().find((u) => u.email === email);
      const ok = !!user && typeof password === "string" && timingSafeEqual(Buffer.from(hash(password, user.salt)), Buffer.from(user.hash));
      if (!ok) {
        const n = (f?.until > 0 ? 0 : f?.n ?? 0) + 1;
        failures.set(email, n >= LOCK_AFTER ? { n: 0, until: now + LOCK_MS } : { n });
        return { error: "That email and password don't match an account" };
      }
      failures.delete(email);
      if (user.status !== "approved") return { error: "Your account is waiting for the owner's approval" };
      return { user };
    },
    // Forgot password: a one-time link token for this email, or null (no such account, or one was sent a minute ago).
    // Only the token's hash is stored, so the users file alone can't be used to reset anyone.
    startReset(email, now = Date.now()) {
      email = typeof email === "string" ? email.trim().toLowerCase() : "";
      const users = read(), u = users.find((x) => x.email === email);
      if (!u || (u.resetAt && now - u.resetAt < RESET_GAP_MS)) return null;
      const token = randomBytes(32).toString("base64url");
      Object.assign(u, { resetHash: sha(token), resetExp: now + RESET_MS, resetAt: now });
      write(users);
      return { token, email: u.email };
    },
    // Sets the new password from a reset link; the link then stops working, and so do sign-ins made with the old password.
    finishReset(token, password, now = Date.now()) {
      if (badPassword(password)) return { error: badPassword(password) };
      const users = read(), u = typeof token === "string" && token ? users.find((x) => x.resetHash && x.resetExp > now && x.resetHash === sha(token)) : null;
      if (!u) return { error: "This reset link has expired or was already used. Ask for a new one" };
      u.salt = randomBytes(16).toString("base64url");
      u.hash = hash(password, u.salt);
      delete u.resetHash; delete u.resetExp;
      write(users);
      failures.delete(u.email);
      return { user: u };
    },
    setStatus(id, status) {
      const users = read(), u = users.find((x) => x.id === id);
      if (!u || u.role === "owner") return "No such account";
      if (status === "removed") write(users.filter((x) => x.id !== id));
      else if (status === "approved") { u.status = "approved"; write(users); }
      else return "Approve or remove";
      return null;
    },
    // keys: { NAME: value }; an empty value removes that key.
    setKeys(id, keys) {
      const users = read(), u = users.find((x) => x.id === id);
      if (!u) return "No such account";
      const now = u.keys ? open(u.keys) : {};
      for (const k of KEY_NAMES) {
        if (typeof keys?.[k] !== "string") continue;
        if (keys[k].length > 300) return `${k} is too long`;
        if (keys[k].trim()) now[k] = keys[k].trim(); else delete now[k];
      }
      u.keys = seal(now);
      write(users);
      return null;
    },
    // The keys this user's work runs with: the owner's .env.local, everyone else their own (possibly none).
    keysFor(user, env = process.env) {
      if (user?.role === "owner") return Object.fromEntries(KEY_NAMES.map((k) => [k, env[k]]));
      return user?.keys ? open(user.keys) : {};
    },
  };
}
