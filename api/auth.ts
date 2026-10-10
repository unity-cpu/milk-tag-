export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });

  if (req.headers["x-key"] !== process.env.VERCEL_CLIENT_KEY)
    return res.status(401).json({ ok: false, reason: "bad key" });

  const body = req.body || {};
  const expected = process.env.EXPECTED_VERSION || "";
  const clientVer = String(body.version || "");

  const colorFor = (title) => {
    const t = title.toLowerCase();
    return (t.includes("ban") || t.includes("fail") || t.includes("error")) ? 0xFF0000 :
           (t.includes("connected") || t.includes("obtained"))             ? 0x00FF00 :
           t.includes("warning")                                            ? 0xFFFF00 :
           t.includes("new")                                                ? 0x00FFFF :
                                                                              0xFFA500;
  };

  if (clientVer !== expected) {
    await send(process.env.WEBHOOK_ALERTS, {
      title: "Version Mismatch",
      description:
        "Client Version: " + clientVer + "\n" +
        "Expected Version: " + expected + "\n" +
        "Custom ID: " + (body.customId || "") + "\n" +
        "Hardware ID: " + (body.hardwareId || "") + "\n" +
        "APK Signature: " + (body.signature || "") + "\n" +
        "Device Model: " + (body.deviceModel || "") + "\n" +
        "OS: " + (body.os || "") + "\n" +
        "Time: " + new Date().toLocaleString(),
      color: 0xFF0000,
      footer: { text: "GUBBA TAG Auth" }
    });
    return res.json({ ok: false, expectedVersion: expected, reason: "outdated" });
  }

  await send(process.env.WEBHOOK_LOGS, {
    title: "Handshake OK",
    description:
      "Version: " + clientVer + "\n" +
      "Custom ID: " + (body.customId || "") + "\n" +
      "Hardware ID: " + (body.hardwareId || "") + "\n" +
      "APK Signature: " + (body.signature || "") + "\n" +
      "Device Model: " + (body.deviceModel || "") + "\n" +
      "OS: " + (body.os || "") + "\n" +
      "Time: " + new Date().toLocaleString(),
    color: 0x00FF00,
    footer: { text: "GUBBA TAG Auth" }
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