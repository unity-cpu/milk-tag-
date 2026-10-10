import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const key = req.headers["x-key"];
  if (key !== process.env.VERCEL_CLIENT_KEY)
    return res.status(401).end();

  const p = req.body || {};
  const type = String(p.type || "log");

  const isAlert = type !== "log" && type !== "boot";
  const url = isAlert ? process.env.WEBHOOK_ALERTS : process.env.WEBHOOK_LOGS;

  if (!url) return res.json({ ok: true });

  const color =
    type === "ban" ? 0xff0000 :
    type === "error" ? 0xff8800 :
    type === "connect" ? 0x00aaff :
    type === "warn" ? 0xffcc00 :
    0x00cc66;

  const desc = [
    p.message || "",
    "",
    `cid: ${p.customId || "?"}`,
    `pf: ${p.playFabId || "?"}`,
    `hwid: ${p.hardwareId || "?"}`,
    `ver: ${p.version || "?"}`,
    `sig: ${p.signature || "?"}`,
    `${p.deviceModel || "?"} / ${p.os || "?"}`,
  ].join("\n");

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: String(p.title || type),
            description: desc.slice(0, 4000),
            color,
            timestamp: p.timestamp || new Date().toISOString(),
            footer: { text: `gt-auth | ${type}` },
          },
        ],
      }),
    });
  } catch {}

  return res.json({ ok: true });
}