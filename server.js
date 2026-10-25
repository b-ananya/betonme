import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coachGoal, verifyProof, commentary, bustHeadline, aiMode } from "./ai.js";
import { seed } from "./seed.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(ROOT, "data", "db.json");
const UPLOADS = path.join(ROOT, "uploads");
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : seed();
const save = () => { db.version = (db.version ?? 0) + 1; fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); };
save();

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname) || ".bin"}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(UPLOADS));
app.use("/seed-media", express.static(path.join(ROOT, "seed-media")));

const uid = () => Math.random().toString(36).slice(2, 10);
const userName = (id) => db.users.find((u) => u.id === id)?.name ?? "?";
const findBet = (req, res) => {
  const bet = db.bets.find((b) => b.id === req.params.id);
  if (!bet) res.status(404).json({ error: "Bet not found" });
  return bet;
};
const counts = (c) => c.approved || c.overruledBy.length > 0;
const checkedInToday = (b) => b.checkins.some((c) => c.day === db.day && counts(c));
const streak = (b) => b.checkins.filter(counts).length;

function view(b) {
  return {
    ...b,
    user: userName(b.userId),
    dayIndex: Math.min(db.day - b.startDay + 1, b.durationDays),
    pending: b.startDay > db.day,
    streak: streak(b),
    checkedInToday: checkedInToday(b),
    backPool: b.backers.reduce((s, w) => s + w.amount, 0),
    fadePool: b.faders.reduce((s, w) => s + w.amount, 0),
  };
}

/* ---------------- read ---------------- */

app.get("/api/state", (_req, res) => {
  res.json({ day: db.day, aiMode, users: db.users, bets: db.bets.map(view).reverse(), version: db.version });
});

let tickerCache = { version: -1, data: null };
app.get("/api/ticker", async (_req, res) => {
  if (tickerCache.version !== db.version) {
    const board = db.bets.map(view).map((b) => ({
      user: b.user, title: b.title, status: b.status, streak: b.streak, day: `${b.dayIndex}/${b.durationDays}`,
      checkedInToday: b.checkedInToday, line: b.line, punishment: b.punishment, backPool: b.backPool, fadePool: b.fadePool,
    }));
    tickerCache = { version: db.version, data: await commentary(board) };
  }
  res.json(tickerCache.data);
});

/* ---------------- AI coach + bet creation ---------------- */

app.post("/api/ai/coach", async (req, res) => {
  const { text, as } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Tell the coach what you want to do." });
  const history = db.bets.filter((b) => b.userId === as && b.status !== "active");
  res.json(await coachGoal(text, history));
});

app.post("/api/bets", (req, res) => {
  const b = req.body;
  if (!b.as || !b.goal || !b.punishment) return res.status(400).json({ error: "Missing goal or punishment" });
  const bet = {
    id: uid(), userId: b.as, title: b.title || "My Bet", goal: b.goal, proof: b.proof || "A photo of you doing it.",
    durationDays: Math.max(1, Math.min(60, Number(b.durationDays) || 7)), startDay: db.day + 1, // day 1 is tomorrow
    punishment: b.punishment, spice: Number(b.spice) || 2, successPct: Number(b.successPct) || 50,
    line: b.line || "EVEN", oddsReasoning: b.oddsReasoning || "", tip: b.tip || "",
    refs: b.refs ?? [], checkins: [], status: "active", backers: [], faders: [],
    punishmentProof: null, reactions: {}, comments: [], createdAt: Date.now(),
  };
  db.bets.push(bet);
  save();
  res.json(view(bet));
});

/* ---------------- check-ins ---------------- */

app.post("/api/bets/:id/checkin", upload.single("file"), async (req, res) => {
  const bet = findBet(req, res);
  if (!bet) return;
  if (bet.userId !== req.body.as) return res.status(403).json({ error: "Only the bettor can post proof" });
  if (bet.status !== "active") return res.status(400).json({ error: "This bet is settled" });
  if (bet.startDay > db.day) return res.status(400).json({ error: "Your bet starts tomorrow - rest up!" });
  const image = req.file && /^image\//.test(req.file.mimetype)
    ? { mime: req.file.mimetype, base64: fs.readFileSync(req.file.path).toString("base64") }
    : null;
  const verdict = await verifyProof(bet, req.body.caption ?? "", image);
  // Replace any earlier attempt today so a rejected photo can be retried.
  bet.checkins = bet.checkins.filter((c) => c.day !== db.day);
  const checkin = {
    day: db.day, caption: req.body.caption ?? "", file: req.file ? `/uploads/${req.file.filename}` : null,
    mime: req.file?.mimetype ?? null, ...verdict, overruledBy: [], ts: Date.now(),
  };
  bet.checkins.push(checkin);
  save();
  res.json({ checkin, bet: view(bet) });
});

// Friends are the final word: any friend can overrule an AI rejection.
app.post("/api/bets/:id/overrule", (req, res) => {
  const bet = findBet(req, res);
  if (!bet) return;
  const c = bet.checkins.find((x) => x.day === db.day);
  if (!c || req.body.as === bet.userId) return res.status(400).json({ error: "Nothing to overrule" });
  if (!c.overruledBy.includes(req.body.as)) c.overruledBy.push(req.body.as);
  save();
  res.json(view(bet));
});

/* ---------------- social: wagers, reactions, comments ---------------- */

app.post("/api/bets/:id/wager", (req, res) => {
  const bet = findBet(req, res);
  if (!bet) return;
  const { as, side } = req.body;
  const amount = Math.max(10, Number(req.body.amount) || 50);
  const user = db.users.find((u) => u.id === as);
  if (!user || as === bet.userId) return res.status(400).json({ error: "You can't wager on your own bet" });
  if (bet.status !== "active") return res.status(400).json({ error: "Bet is settled" });
  if (user.coins < amount) return res.status(400).json({ error: "Not enough coins" });
  user.coins -= amount;
  (side === "fade" ? bet.faders : bet.backers).push({ userId: as, amount });
  save();
  res.json(view(bet));
});

app.post("/api/bets/:id/react", (req, res) => {
  const bet = findBet(req, res);
  if (!bet) return;
  const { as, emoji } = req.body;
  const list = (bet.reactions[emoji] ??= []);
  const i = list.indexOf(as);
  i >= 0 ? list.splice(i, 1) : list.push(as);
  save();
  res.json(view(bet));
});

app.post("/api/bets/:id/comment", (req, res) => {
  const bet = findBet(req, res);
  if (!bet || !req.body.text?.trim()) return res.status(400).end();
  bet.comments.push({ userId: req.body.as, text: req.body.text.trim().slice(0, 280), ts: Date.now() });
  save();
  res.json(view(bet));
});

app.post("/api/bets/:id/punishment", upload.single("file"), (req, res) => {
  const bet = findBet(req, res);
  if (!bet) return;
  if (bet.status !== "busted" || bet.userId !== req.body.as) return res.status(400).json({ error: "No punishment owed" });
  if (!req.file) return res.status(400).json({ error: "Upload the recording!" });
  bet.punishmentProof = { file: `/uploads/${req.file.filename}`, mime: req.file.mimetype, caption: req.body.caption ?? "", ts: Date.now() };
  save();
  res.json(view(bet));
});

/* ---------------- settlement ---------------- */

function settle(bet, won) {
  bet.status = won ? "won" : "busted";
  const p = bet.successPct / 100;
  const winners = won ? bet.backers : bet.faders;
  const multiplier = won ? 1 / p : 1 / (1 - p);
  for (const w of winners) {
    const u = db.users.find((x) => x.id === w.userId);
    if (u) u.coins += Math.round(w.amount * multiplier);
  }
  if (won) db.users.find((x) => x.id === bet.userId).coins += 100 * bet.durationDays / 7 | 0;
}

// Demo time machine: ends the current day for everyone.
app.post("/api/demo/advance", async (_req, res) => {
  const events = [];
  for (const bet of db.bets.filter((b) => b.status === "active" && b.startDay <= db.day)) {
    if (!checkedInToday(bet)) {
      settle(bet, false);
      bet.bustDay = db.day;
      bet.headline = await bustHeadline(bet, userName(bet.userId));
      events.push({ type: "busted", betId: bet.id, user: userName(bet.userId), headline: bet.headline });
    } else if (db.day - bet.startDay + 1 >= bet.durationDays) {
      settle(bet, true);
      events.push({ type: "won", betId: bet.id, user: userName(bet.userId), title: bet.title });
    }
  }
  db.day += 1;
  save();
  res.json({ day: db.day, events });
});

app.post("/api/demo/reset", (_req, res) => {
  db = seed();
  save();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BetOnMe running on http://localhost:${PORT}  (AI: ${aiMode})`));
