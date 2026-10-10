export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (req.headers["x-key"] !== process.env.VERCEL_CLIENT_KEY)
    return res.status(401).end();

  const p = req.body || {};
  const type = String(p.type || "log");

  const isAlert = type !== "log" && type !== "boot";
  const url = isAlert ? process.env.WEBHOOK_ALERTS : process.env.WEBHOOK_LOGS;
  if (!url) return res.json({ ok: true });

  const title = String(p.title || type);
  const t = title.toLowerCase();

  const color =
    (t.includes("ban") || t.includes("fail") || t.includes("error")) ? 0xFF0000 :
    (t.includes("connected") || t.includes("obtained"))             ? 0x00FF00 :
    t.includes("warning")                                            ? 0xFFFF00 :
    t.includes("new")                                                ? 0x00FFFF :
                                                                       0xFFA500;

  const embed = {
    title,
    description: p.message || "",
    color,
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