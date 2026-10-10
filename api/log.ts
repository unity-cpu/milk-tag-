export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (req.headers["x-key"] !== process.env.VERCEL_CLIENT_KEY)
    return res.status(401).end();

  const p = req.body || {};
  const type = String(p.type || "log");

  const isAlert = type !== "log" && type !== "boot";
  const url = isAlert ? process.env.WEBHOOK_ALERTS : process.env.WEBHOOK_LOGS;
  if (!url) return res.json({ ok: true });

  const colorMap = {
    boot:    0x5865f2,
    connect: 0x57f287,
    ban:     0xed4245,
    error:   0xfee75c,
    warn:    0xfee75c,
    log:     0x99aab5
  };

  const embed = {
    title: p.title || type,
    description: p.message || "",
    color: colorMap[type] || 0x99aab5,
    timestamp: p.timestamp || new Date().toISOString(),
    footer: { text: "GUBBA TAG Auth" }
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