import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();
const ROUND_TYPES = ["APTITUDE", "TECHNICAL", "AI_INTERVIEW"];

router.get("/", async (req, res) => {
  const sessions = await prisma.interviewSession.findMany({
    orderBy: { createdAt: "desc" },
    include: { rounds: { orderBy: { order: "asc" } } },
  });
  res.json(sessions);
});

router.post("/", async (req, res) => {
  const { title, role, description, startsAt, endsAt, rounds, proctoring } = req.body;

  if (!title || !role || !startsAt || !endsAt)
    return res.status(400).json({ error: "Title, role, start and end are required" });
  if (new Date(endsAt) <= new Date(startsAt))
    return res.status(400).json({ error: "End must be after start" });
  if (!Array.isArray(rounds) || rounds.length === 0 || rounds.some((r) => !ROUND_TYPES.includes(r.type)))
    return res.status(400).json({ error: "Pick at least one valid round" });

  const session = await prisma.interviewSession.create({
    data: {
      title,
      role,
      description,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      proctoring: proctoring || {},
      rounds: {
        create: rounds.map((r, i) => ({
          type: r.type,
          durationMin: Number(r.durationMin) || 30,
          order: i + 1,
        })),
      },
    },
    include: { rounds: true },
  });
  res.status(201).json(session);
});

export default router;