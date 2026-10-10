export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

  if (req.headers["x-key"] !== process.env.VERCEL_CLIENT_KEY)
    return res.status(401).json({ ok: false, reason: "bad key" });

  const body = req.body || {};
  const expected = process.env.EXPECTED_VERSION || "";
  const clientVer = String(body.version || "");

  if (clientVer !== expected) {
    await send(process.env.WEBHOOK_ALERTS, {
      title: "Outdated Client",
      color: 0xed4245,
      description:
        "Version: " + clientVer + "\n" +
        "Expected: " + expected + "\n" +
        "Custom ID: " + (body.customId || "?") + "\n" +
        "Hardware ID: " + (body.hardwareId || "?") + "\n" +
        "Device: " + (body.deviceModel || "?") + "\n" +
        "OS: " + (body.os || "?"),
      footer: { text: "milk-tag" }
    });
    return res.json({ ok: false, expectedVersion: expected, reason: "outdated" });
  }

  await send(process.env.WEBHOOK_LOGS, {
    title: "Handshake OK",
    color: 0x57f287,
    description:
      "Version: " + clientVer + "\n" +
      "Custom ID: " + (body.customId || "?") + "\n" +
      "Hardware ID: " + (body.hardwareId || "?"),
    footer: { text: "milk-tag" }
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