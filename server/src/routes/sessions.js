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

router.get("/:id", async (req, res) => {
  const session = await prisma.interviewSession.findUnique({
    where: { id: req.params.id },
    include: {
      rounds: {
        orderBy: { order: "asc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// Replaces all questions of an aptitude round in one go
router.put("/:id/rounds/:roundId/questions", async (req, res) => {
  const { questions, shuffleQuestions, shuffleOptions } = req.body;

  const round = await prisma.round.findFirst({
    where: { id: req.params.roundId, sessionId: req.params.id, type: "APTITUDE" },
    include: { session: true },
  });
  if (!round) return res.status(404).json({ error: "Aptitude round not found" });
  if (round.session.status !== "DRAFT")
    return res.status(400).json({ error: "Published sessions can't be edited" });
  if (!Array.isArray(questions))
    return res.status(400).json({ error: "questions must be an array" });

  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    const opts = Array.isArray(q.options) ? q.options : [];
    const correct = Array.isArray(q.correct) ? q.correct : [];
    if (typeof q.text !== "string" || !q.text.trim())
      return res.status(400).json({ error: `Question ${n}: text is required` });
    if (opts.length < 2 || opts.some((o) => typeof o !== "string" || !o.trim()))
      return res.status(400).json({ error: `Question ${n}: needs at least 2 non-empty options` });
    if (correct.length === 0 || correct.some((c) => !Number.isInteger(c) || c < 0 || c >= opts.length))
      return res.status(400).json({ error: `Question ${n}: mark the correct answer` });
    if (q.type === "SINGLE" && correct.length !== 1)
      return res.status(400).json({ error: `Question ${n}: single choice needs exactly one correct answer` });
  }

  await prisma.$transaction([
    prisma.aptitudeQuestion.deleteMany({ where: { roundId: round.id } }),
    prisma.aptitudeQuestion.createMany({
      data: questions.map((q, i) => ({
        roundId: round.id,
        type: q.type === "MULTI" ? "MULTI" : "SINGLE",
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correct: q.correct,
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        order: i,
      })),
    }),
    prisma.round.update({
      where: { id: round.id },
      data: { shuffleQuestions: !!shuffleQuestions, shuffleOptions: !!shuffleOptions },
    }),
  ]);

  res.json({ ok: true });
});

export default router;