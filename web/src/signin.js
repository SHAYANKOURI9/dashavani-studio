// Every part of the studio needs an account. A sign-in that runs out mid-work goes to the sign-in page and back.
// The Account panel: your email, your own API keys (the owner's live in .env.local), and for the owner, new accounts to approve.
import { t } from "./i18n.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const toLogin = () => location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
const post = (url, data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

// Runs a request; if the sign-in has run out, goes to sign in and comes back here.
export async function withSignIn(run) {
  const res = await run();
  if (res.status === 401) toLogin();
  return res;
}

const langName = (code) => new Intl.DisplayNames(["en"], { type: "language" }).of(code);
// "(saved)" with a button that removes it, or "(not set)".
const savedMark = (me) => (k) => me.keys.includes(k) ? `<span class="muted">${esc(t("(saved)"))}</span> <button type="button" class="quiet" data-clear="${k}">${esc(t("Remove"))}</button>` : `<span class="muted">${esc(t("(not set)"))}</span>`;
const KEY_LABELS = { GEMINI_API_KEY: "Gemini API key", ELEVENLABS_API_KEY: "ElevenLabs API key", HEYGEN_API_KEY: "HeyGen API key", HEYGEN_AVATAR_ID: "HeyGen avatar ID" };

async function openAccount() {
  const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null));
  if (!me) return toLogin();
  const owner = me.role === "owner", saved = savedMark(me);
  const d = document.createElement("dialog");
  d.className = "signin account";
  d.setAttribute("aria-labelledby", "ac-h");
  d.innerHTML = `<form novalidate>
    <h2 id="ac-h">${esc(t("Your account"))}</h2>
    <p>${esc(me.email)} · ${esc(t(owner ? "Owner" : "Editor"))}</p>
    ${owner ? `<p>${esc(t("Your videos use the API keys in .env.local. Other accounts use their own."))}</p>` : `
      <p>${esc(t("Videos you make are paid with your own keys. Saved keys are encrypted and never shown again; leave a box empty to keep what is saved."))}</p>
      ${me.keyNames.map((k) => `<label for="ac-${k}">${esc(t(KEY_LABELS[k]))} ${saved(k)}</label>
        <div class="field"><input id="ac-${k}" name="${k}" type="password" autocomplete="off" spellcheck="false" style="padding-right:16px;margin-bottom:12px"></div>`).join("")}
      <details><summary>${esc(t("Voices (optional)"))}</summary>
        <p class="muted">${esc(t("A voice ID from your ElevenLabs library for each language. Without one, a built-in voice is used."))}</p>
        ${me.voiceNames.map((k) => `<label for="ac-${k}">${esc(langName(k.slice(-2).toLowerCase()))} ${saved(k)}</label>
        <div class="field"><input id="ac-${k}" name="${k}" autocomplete="off" spellcheck="false" style="padding-right:16px;margin-bottom:12px"></div>`).join("")}
      </details>`}
    <details${me.mustChange ? " open" : ""}><summary>${esc(t("Change password"))}</summary>
      ${me.mustChange ? `<p>${esc(t("You signed in with a temporary password. Pick your own to carry on."))}</p>` : ""}
      <label for="ac-cur">${esc(t("Current password"))}</label><div class="field"><input id="ac-cur" type="password" autocomplete="current-password" style="padding-right:16px;margin-bottom:12px"></div>
      <label for="ac-new">${esc(t("New password"))}</label><div class="field"><input id="ac-new" type="password" autocomplete="new-password" minlength="8" style="padding-right:16px;margin-bottom:12px"></div>
      <div class="row"><button type="button" data-pw>${esc(t("Change password"))}</button></div>
    </details>
    ${owner ? `<h3>${esc(t("Accounts"))}</h3><ul class="ac-users" aria-live="polite"><li>${esc(t("Loading…"))}</li></ul>` : ""}
    <p id="ac-note" aria-live="polite"></p>
    <p class="error" id="ac-err" role="alert"></p>
    <div class="row"><button type="button" class="quiet" data-out>${esc(t("Sign out"))}</button><button type="button" class="quiet" data-close>${esc(t("Close"))}</button>${owner ? "" : `<button type="submit" class="primary">${esc(t("Save keys"))}</button>`}</div>
  </form>`;
  document.body.append(d);
  const err = d.querySelector("#ac-err");
  const showUsers = (list) => {
    const others = list.filter((u) => u.role !== "owner");
    d.querySelector(".ac-users").innerHTML = others.length ? others.map((u) => `<li><span>${esc(u.email)} <span class="muted">${esc(t(u.status === "pending" ? "waiting for approval" : "approved"))}</span></span>
      <span>${u.status === "pending" ? `<button type="button" data-id="${esc(u.id)}" data-status="approved">${esc(t("Approve"))}</button>` : `<button type="button" class="quiet" data-id="${esc(u.id)}" data-reset>${esc(t("Reset password"))}</button>`}<button type="button" class="quiet" data-id="${esc(u.id)}" data-status="removed">${esc(t("Remove"))}</button></span></li>`).join("")
      : `<li class="muted">${esc(t("Nobody else has signed up yet."))}</li>`;
  };
  if (owner) {
    fetch("/api/users").then((r) => r.json()).then(showUsers);
    d.querySelector(".ac-users").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-id]");
      if (!b) return;
      if ("reset" in b.dataset) {
        if (!confirm(t("Give this account a temporary password? Their current password stops working."))) return;
        const res = await post(`/api/users/${b.dataset.id}/password`, {}), data = await res.json();
        err.textContent = res.ok ? "" : t(data.error);
        d.querySelector("#ac-note").textContent = res.ok ? t("Temporary password: {password} (send it to them; they must change it after signing in)", { password: data.password }) : "";
        return;
      }
      if (b.dataset.status === "removed" && !confirm(t("Remove this account? They will not be able to sign in."))) return;
      const res = await post(`/api/users/${b.dataset.id}/status`, { status: b.dataset.status });
      const data = await res.json();
      res.ok ? showUsers(data) : (err.textContent = t(data.error));
    });
  }
  d.querySelector("[data-close]").addEventListener("click", () => d.close());
  d.querySelectorAll("[data-clear]").forEach((b) => b.addEventListener("click", async () => {
    const res = await post("/api/me/keys", { [b.dataset.clear]: "" }); // an empty value removes it
    if (!res.ok) { err.textContent = t((await res.json()).error); return; }
    d.close();
    openAccount();
  }));
  d.querySelector("[data-pw]").addEventListener("click", async () => {
    const res = await post("/api/me/password", { current: d.querySelector("#ac-cur").value, password: d.querySelector("#ac-new").value });
    if (!res.ok) { err.textContent = t((await res.json()).error); return; }
    d.close();
    if (me.mustChange) location.reload(); else openAccount();
  });
  d.querySelector("[data-out]").addEventListener("click", async () => { await fetch("/api/logout", { method: "POST" }); location.assign("/login"); });
  d.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const keys = Object.fromEntries([...me.keyNames, ...me.voiceNames].map((k) => [k, d.querySelector(`#ac-${k}`).value]).filter(([, v]) => v.trim()));
    if (!Object.keys(keys).length) { err.textContent = t("Paste at least one key to save."); return; }
    const res = await post("/api/me/keys", keys);
    if (!res.ok) { err.textContent = t((await res.json()).error); return; }
    d.close();
    openAccount(); // shows the keys as saved
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
}

// Top bar: Account once signed in; the footer's Sign out too.
fetch("/api/stats").then((r) => r.json()).then(({ signedIn }) => {
  const inBtn = document.getElementById("nav-signin"), acBtn = document.getElementById("nav-account"), outBtn = document.getElementById("signout");
  if (inBtn) { inBtn.hidden = signedIn; inBtn.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; }
  if (acBtn) acBtn.hidden = !signedIn;
  if (outBtn) outBtn.hidden = !signedIn;
}).catch(() => {});
document.getElementById("nav-account")?.addEventListener("click", openAccount);
// Signed in with a temporary password: the account panel opens to change it.
fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((m) => m?.mustChange && openAccount()).catch(() => {});
document.getElementById("signout")?.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.assign("/login");
});
