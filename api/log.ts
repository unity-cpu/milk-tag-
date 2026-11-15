import { timingSafeEqual } from "crypto";

function keyOk(req): boolean {
  const expected = process.env.VERCEL_CLIENT_KEY || "";
  const got = String(req.headers["x-key"] || "");
  // fail closed: an unset env var must NOT match a missing header
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!keyOk(req)) return res.status(401).end();

  const p = req.body || {};
  const type = String(p.type || "log").slice(0, 32);

  // Only bans and errors go to the alerts webhook. connect/log/boot go to logs.
  const isAlert = type === "ban" || type === "error";
  const url = isAlert ? process.env.WEBHOOK_ALERTS : process.env.WEBHOOK_LOGS;
  if (!url) return res.json({ ok: true });

  const title = String(p.title || type).slice(0, 250);
  const t = title.toLowerCase();

  const color =
    (t.includes("ban") || t.includes("fail") || t.includes("error") || t.includes("modded")) ? 0xFF0000 :
    (t.includes("connected") || t.includes("obtained"))                                      ? 0x00FF00 :
    t.includes("warning")                                                                     ? 0xFFFF00 :
    t.includes("new")                                                                         ? 0x00FFFF :
                                                                                                0xFFA500;

  // A bad client timestamp makes Discord reject the whole embed, so validate it once.
  const ts =
    p.timestamp && !isNaN(Date.parse(p.timestamp))
      ? new Date(p.timestamp).toISOString()
      : new Date().toISOString();

  // Never let a session ticket reach Discord, even if a client sends one
  const message = String(p.message || "").replace(/Session Ticket:.*/g, "Session Ticket: [hidden]");

  // Discord limits: field values 1024 chars, description 4096. Backticks would break the formatting.
  const code = (v) => {
    const s = String(v ?? "").replace(/`/g, "'").slice(0, 1000);
    return s ? "`" + s + "`" : "`N/A`";
  };

  const embed = {
    title,
    description: "```\n" + message.replace(/```/g, "'''").slice(0, 3900) + "\n```",
    color,
    fields: [
      { name: "Type",          value: code(type),         inline: true },
      { name: "Version",       value: code(p.version),    inline: true },
      { name: "Time",          value: code(ts),           inline: true },
      { name: "PlayFab ID",    value: code(p.playFabId),  inline: false },
      { name: "Custom ID",     value: code(p.customId),   inline: false },
      { name: "Hardware ID",   value: code(p.hardwareId), inline: false },
      { name: "Device",        value: code(p.deviceModel),inline: true },
      { name: "OS",            value: code(p.os),         inline: true },
      { name: "APK Signature", value: code(p.signature),  inline: false }
    ],
    timestamp: ts
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch {}

  return res.json({ ok: true });
}
