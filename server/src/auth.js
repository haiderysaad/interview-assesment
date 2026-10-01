import crypto from "node:crypto";

const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();

export function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return res.status(500).json({ error: "ADMIN_KEY is not set on the server" });
  if (!crypto.timingSafeEqual(digest(req.get("x-admin-key") || ""), digest(key)))
    return res.status(401).json({ error: "Wrong or missing admin key" });
  next();
}