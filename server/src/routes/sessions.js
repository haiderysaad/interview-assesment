import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();
const ROUND_TYPES = ["APTITUDE", "TECHNICAL", "AI_INTERVIEW"];
const QUESTION_TYPES = ["SINGLE", "MULTI"];
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

router.get("/", async (req, res) => {
  const sessions = await prisma.interviewSession.findMany({
    orderBy: { createdAt: "desc" },
    include: { rounds: { orderBy: { order: "asc" } } },
  });
  res.json(sessions);
});

router.post("/", async (req, res) => {
  const { title, role, description, startsAt, endsAt, rounds, proctoring } = req.body;

    if (
    typeof title !== "string" || !title.trim() ||
    typeof role !== "string" || !role.trim() ||
    !startsAt || !endsAt
  )
    return res.status(400).json({ error: "Title, role, start and end are required" });

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start) || isNaN(end))
    return res.status(400).json({ error: "Start and end must be valid dates" });
  if (end <= start)
    return res.status(400).json({ error: "End must be after start" });
  if (!Array.isArray(rounds) || rounds.length === 0 || rounds.some((r) => !isPlainObject(r) || !ROUND_TYPES.includes(r.type)))
    return res.status(400).json({ error: "Pick at least one valid round" });
  if (new Set(rounds.map((r) => r.type)).size !== rounds.length)
    return res.status(400).json({ error: "Each round type can be used only once" });

  const durations = rounds.map((r) => (r.durationMin === undefined ? 30 : Number(r.durationMin)));
  if (durations.some((d) => !Number.isInteger(d) || d < 1))
    return res.status(400).json({ error: "Round duration must be a whole number of minutes (at least 1)" });
  if (proctoring !== undefined && !isPlainObject(proctoring))
    return res.status(400).json({ error: "Proctoring settings must be an object" });

  const session = await prisma.interviewSession.create({
    data: {
      title: title.trim(),
      role: role.trim(),
      description: typeof description === "string" ? description : undefined,
      startsAt: start,
      endsAt: end,
      proctoring: proctoring ?? {},
      rounds: {
        create: rounds.map((r, i) => ({
          type: r.type,
          durationMin: durations[i],
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

  const clean = [];
  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    if (!isPlainObject(q))
      return res.status(400).json({ error: `Question ${n}: invalid question` });
    if (q.type !== undefined && !QUESTION_TYPES.includes(q.type))
      return res.status(400).json({ error: `Question ${n}: invalid answer type` });
    const type = q.type === "MULTI" ? "MULTI" : "SINGLE";
    const opts = Array.isArray(q.options) ? q.options : [];
    const correct = Array.isArray(q.correct) ? q.correct : [];
    if (typeof q.text !== "string" || !q.text.trim())
      return res.status(400).json({ error: `Question ${n}: text is required` });
    if (opts.length < 2 || opts.some((o) => typeof o !== "string" || !o.trim()))
      return res.status(400).json({ error: `Question ${n}: needs at least 2 non-empty options` });
    if (correct.length === 0 || correct.some((c) => !Number.isInteger(c) || c < 0 || c >= opts.length))
      return res.status(400).json({ error: `Question ${n}: mark the correct answer` });
    if (new Set(correct).size !== correct.length)
      return res.status(400).json({ error: `Question ${n}: duplicate correct answers` });
    if (type === "SINGLE" && correct.length !== 1)
      return res.status(400).json({ error: `Question ${n}: single choice needs exactly one correct answer` });

    const marks = q.marks === undefined ? 1 : q.marks === "" ? NaN : Number(q.marks);
    const negativeMarks = q.negativeMarks === undefined || q.negativeMarks === "" ? 0 : Number(q.negativeMarks);
    if (!Number.isInteger(marks) || marks < 0)
      return res.status(400).json({ error: `Question ${n}: points must be a whole number, 0 or more` });
    if (!Number.isFinite(negativeMarks) || negativeMarks < 0)
      return res.status(400).json({ error: `Question ${n}: negative marks must be 0 or more` });

    clean.push({ type, text: q.text.trim(), options: opts.map((o) => o.trim()), correct, marks, negativeMarks });
  }

  await prisma.$transaction([
    prisma.aptitudeQuestion.deleteMany({ where: { roundId: round.id } }),
    prisma.aptitudeQuestion.createMany({
      data: clean.map((q, i) => ({ roundId: round.id, ...q, order: i })),
    }),
    prisma.round.update({
      where: { id: round.id },
      data: {
        ...(shuffleQuestions !== undefined && { shuffleQuestions: !!shuffleQuestions }),
        ...(shuffleOptions !== undefined && { shuffleOptions: !!shuffleOptions }),
      },
    }),
  ]);

  res.json({ ok: true });
});

export default router;