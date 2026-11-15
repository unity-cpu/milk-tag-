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

// Returns true only if the HWID is on the BannedHwids title-data list.
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

  if (!keyOk(req)) return res.status(401).json({ ok: false, reason: "bad key" });

  const body = req.body || {};
  const expected = process.env.EXPECTED_VERSION || "";
  const clientVer = String(body.version || "").slice(0, 64);
  const customId = String(body.customId || "").slice(0, 120);
  const hwid = String(body.hardwareId || "").slice(0, 120);
  const sig = String(body.signature || "").trim().toLowerCase().slice(0, 128);

  const details =
    "Version: " + clientVer + "\n" +
    "Custom ID: " + customId + "\n" +
    "Hardware ID: " + hwid + "\n" +
    "APK Signature: " + sig + "\n" +
    "Device Model: " + String(body.deviceModel || "").slice(0, 80) + "\n" +
    "OS: " + String(body.os || "").slice(0, 80) + "\n" +
    "Time: " + new Date().toISOString();

  // 1) version
  if (!expected || clientVer !== expected) {
    await send(process.env.WEBHOOK_ALERTS, {
      title: "Version Mismatch",
      description: "Expected Version: " + expected + "\n" + details,
      color: 0xFF0000,
      footer: { text: "Milk Tag Auth" }
    });
    return res.json({ ok: false, expectedVersion: expected, reason: "outdated have " + clientVer + " need " + expected });
  }

  // 2) APK signature (fails closed if ALLOWED_SIGS isn't configured)
  const sigs = allowedSigs();
  if (sigs.length === 0 || !sigs.includes(sig)) {
    await send(process.env.WEBHOOK_ALERTS, {
      title: "Signature Mismatch (rejected)",
      description: (sigs.length === 0 ? "ALLOWED_SIGS is not configured\n" : "") + details,
      color: 0xFF0000,
      footer: { text: "Milk Tag Auth" }
    });
    return res.json({ ok: false, expectedVersion: expected, reason: REJECT });
  }

  // 3) banned hardware
  if (await hwidBanned(hwid)) {
    await send(process.env.WEBHOOK_ALERTS, {
      title: "Banned HWID (rejected)",
      description: details,
      color: 0xFF0000,
      footer: { text: "Milk Tag Auth" }
    });
    return res.json({ ok: false, expectedVersion: expected, reason: REJECT });
  }

  await send(process.env.WEBHOOK_LOGS, {
    title: "player authed",
    description: details,
    color: 0x00FF00,
    footer: { text: "Milk Tag Auth" }
  });

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
