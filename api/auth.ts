import { timingSafeEqual } from "crypto";

const REJECT = "rejected"; // the Unity client hard-blocks only on "rejected" or "outdated*"

function keyOk(req): boolean {
  const expected = process.env.VERCEL_CLIENT_KEY || "";
  const got = String(req.headers["x-key"] || "");
  // fail closed: an unset env var must NOT match a missing header
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function allowedSigs(): string[] {
  return (process.env.ALLOWED_SIGS || "")
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// True only if the HWID is on the BannedHwids title-data list.
// Lookup errors fail open (a PlayFab hiccup shouldn't lock everyone out).
async function hwidBanned(hwid: string): Promise<boolean> {
  const title = process.env.PLAYFAB_TITLE_ID;
  const secret = process.env.PLAYFAB_SECRET_KEY;
  if (!hwid || !title || !secret) return false;
  try {
    const r = await fetch(`https://${title}.playfabapi.com/Server/GetTitleData`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SecretKey": secret },
      body: JSON.stringify({ Keys: ["BannedHwids"] })
    });
    if (!r.ok) return false;
    const j: any = await r.json();
    const raw: string = j?.data?.Data?.BannedHwids || "";
    return raw
      .split(/[\n\r,;]+/)
      .map((l) => l.trim())
      .some((l) => l && !l.startsWith("#") && l.toLowerCase() === hwid.toLowerCase());
  } catch {
    return false;
  }
}

// Backticks would break Discord formatting; field values max out at 1024 chars.
const code = (v) => {
  const s = String(v ?? "").replace(/`/g, "'").slice(0, 1000);
  return s ? "`" + s + "`" : "`N/A`";
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

  if (!keyOk(req)) return res.status(401).json({ ok: false, reason: "bad key" });

  const body = req.body || {};
  const expected = process.env.EXPECTED_VERSION || "";
  const clientVer = String(body.version || "").slice(0, 64);
  const customId = String(body.customId || "").slice(0, 120);
  const hwid = String(body.hardwareId || "").slice(0, 120);
  const sig = String(body.signature || "").trim().toLowerCase().slice(0, 128);
  const device = String(body.deviceModel || "").slice(0, 80);
  const os = String(body.os || "").slice(0, 80);
  const now = new Date().toISOString();

  const embed = (title: string, color: number, extra: any[] = []) => ({
    title,
    color,
    fields: [
      ...extra,
      { name: "Version",       value: code(clientVer), inline: true },
      { name: "Time",          value: code(now),       inline: true },
      { name: "Custom ID",     value: code(customId),  inline: false },
      { name: "Hardware ID",   value: code(hwid),      inline: false },
      { name: "Device",        value: code(device),    inline: true },
      { name: "OS",            value: code(os),        inline: true },
      { name: "APK Signature", value: code(sig),       inline: false }
    ],
    timestamp: now,
    footer: { text: "Unity Tag Auth" }
  });

  // 1) version
  if (!expected || clientVer !== expected) {
    await send(
      process.env.WEBHOOK_ALERTS,
      embed("Version Mismatch", 0xFF0000, [{ name: "Expected Version", value: code(expected), inline: true }])
    );
    return res.json({
      ok: false,
      expectedVersion: expected,
      reason: "outdated update da game"
    });
  }

  // 2) APK signature (fails closed if ALLOWED_SIGS isn't configured)
  const sigs = allowedSigs();
  if (sigs.length === 0 || !sigs.includes(sig)) {
    await send(
      process.env.WEBHOOK_ALERTS,
      embed(
        "Signature Mismatch (rejected)",
        0xFF0000,
        sigs.length === 0 ? [{ name: "Config", value: code("ALLOWED_SIGS is not set"), inline: false }] : []
      )
    );
    return res.json({ ok: false, expectedVersion: expected, reason: REJECT });
  }

  // 3) banned hardware
  if (await hwidBanned(hwid)) {
    await send(process.env.WEBHOOK_ALERTS, embed("Banned HWID (rejected)", 0xFF0000));
    return res.json({ ok: false, expectedVersion: expected, reason: REJECT });
  }

  await send(process.env.WEBHOOK_LOGS, embed("player authed", 0x00FF00));

  return res.json({ ok: true, expectedVersion: expected });
}

async function send(url, embed) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch {}
}
