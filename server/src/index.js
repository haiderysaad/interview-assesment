import "dotenv/config";
import express from "express";
import cors from "cors";
import sessionRoutes from "./routes/sessions.js";
import manageRoutes from "./routes/manage.js";
import candidateRoutes from "./routes/candidate.js";
import { requireAdmin } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/admin/check", requireAdmin, (req, res) => res.json({ ok: true }));
app.use("/api/candidate", candidateRoutes);
app.use("/api/sessions", requireAdmin, sessionRoutes, manageRoutes);

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    const error = err.type === "entity.too.large" ? "Request body too large" : "Invalid request";
    return res.status(status).json({ error });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on ${PORT}`));