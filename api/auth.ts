import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

  const key = req.headers["x-key"];
  if (key !== process.env.VERCEL_CLIENT_KEY)
    return res.status(401).json({ ok: false, reason: "bad key" });

  const body = req.body || {};
  const expected = process.env.EXPECTED_VERSION || "";
  const clientVer = String(body.version || "");

  if (clientVer !== expected) {
    await fire(process.env.WEBHOOK_ALERTS, {
      title: "Outdated Client",
      desc:
        `have ${clientVer} need ${expected}\n` +
        `cid: ${body.customId || "?"}\n` +
        `hwid: ${body.hardwareId || "?"}\n` +
        `sig: ${body.signature || "?"}\n` +
        `${body.deviceModel || "?"} / ${body.os || "?"}`,
      color: 0xff0000,
    });
    return res.json({ ok: false, expectedVersion: expected, reason: "outdated" });
  }

  await fire(process.env.WEBHOOK_LOGS, {
    title: "Handshake OK",
    desc:
      `ver ${clientVer}\n` +
      `cid: ${body.customId || "?"}\n` +
      `hwid: ${body.hardwareId || "?"}`,
    color: 0x00ff00,
  });

  return res.json({ ok: true, expectedVersion: expected });
}

async function fire(url: string | undefined, opts: { title: string; desc: string; color: number }) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: opts.title,
            description: opts.desc,
            color: opts.color,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {}
}