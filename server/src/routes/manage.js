import { Router } from "express";
import { prisma } from "../prisma.js";
import { GRACE_MS, deadlineOf, finalizeAttempt } from "../attempts.js";

// Admin-only (mounted behind requireAdmin)
const router = Router();

router.delete("/:id", async (req, res) => {
  const session = await prisma.interviewSession.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });

  await prisma.interviewSession.delete({ where: { id: session.id } });
  res.json({ ok: true });
});

router.patch("/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["PUBLISHED", "CLOSED"].includes(status))
    return res.status(400).json({ error: "Status must be PUBLISHED or CLOSED" });

  const session = await prisma.interviewSession.findUnique({
    where: { id: req.params.id },
    include: { rounds: { where: { type: "APTITUDE" }, include: { _count: { select: { questions: true } } } } },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (status === "PUBLISHED") {
    if (session.status !== "DRAFT")
      return res.status(400).json({ error: "Only draft sessions can be published" });
    const round = session.rounds[0];
    if (!round) return res.status(400).json({ error: "Only sessions with an aptitude round can be published for now" });
    if (round._count.questions === 0)
      return res.status(400).json({ error: "Add at least one aptitude question before publishing" });
  } else if (session.status !== "PUBLISHED") {
    return res.status(400).json({ error: "Only published sessions can be closed" });
  }

  res.json(await prisma.interviewSession.update({ where: { id: session.id }, data: { status } }));
});

router.post("/:id/candidates", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: "Enter a name and a valid email" });

  const session = await prisma.interviewSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "CLOSED") return res.status(400).json({ error: "This session is closed" });

  try {
    res.status(201).json(await prisma.candidate.create({ data: { sessionId: session.id, name, email } }));
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "That email is already added to this session" });
    throw e;
  }
});

router.get("/:id/results", async (req, res) => {
  const session = await prisma.interviewSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });

  const round = await prisma.round.findFirst({
    where: { sessionId: session.id, type: "APTITUDE" },
    include: { questions: true },
  });
  const candidates = await prisma.candidate.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    include: { attempts: true },
  });

  const rows = [];
  for (const c of candidates) {
    let a = c.attempts[0] ?? null;
    if (a && !a.submittedAt && round && Date.now() > deadlineOf(a, round) + GRACE_MS)
      a = await finalizeAttempt(a, round, true);
    const submitted = !!a?.submittedAt;
    rows.push({
      id: c.id,
      name: c.name,
      email: c.email,
      token: c.token,
      status: !a ? "NOT_STARTED" : submitted ? "SUBMITTED" : "IN_PROGRESS",
      startedAt: a?.startedAt ?? null,
      submittedAt: a?.submittedAt ?? null,
      autoSubmitted: a?.autoSubmitted ?? false,
      score: submitted ? a.score : null,
      totalMarks: submitted ? a.totalMarks : null,
      correctCount: submitted ? a.correctCount : null,
      percentage: submitted && a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 1000) / 10 : null,
    });
  }
  res.json({ questionCount: round?.questions.length ?? 0, candidates: rows });
});

export default router;