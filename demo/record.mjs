// Scripted ~2 minute demo recording. Requires the server running on :3000.
// Usage: node demo/record.mjs   -> demo/out/betonme-demo.mp4
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const OUT = path.join(ROOT, "demo", "out");
const ASSETS = path.join(ROOT, "demo", "assets");
fs.mkdirSync(OUT, { recursive: true });
const W = 1440, H = 900;

await fetch("http://localhost:3000/api/demo/reset", { method: "POST" });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));

// Fake cursor + caption bar, since headless video has neither.
await page.addInitScript(() => {
  localStorage.setItem("me", "alex");
  window.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = `
      #fx-cursor { position: fixed; z-index: 9999; width: 22px; height: 22px; pointer-events: none; left: 0; top: 0;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 2l7 19 2.5-8.5L21 10z' fill='white' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat; }
      #fx-cursor.down::after { content: ""; position: absolute; left: -12px; top: -12px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,230,118,.45); }
      #fx-cap { position: fixed; z-index: 9998; left: 50%; bottom: 26px; transform: translateX(-50%); max-width: 900px; text-align: center;
        background: rgba(5,8,14,.88); border: 1px solid #00e676; color: #fff; font: 600 20px Inter, sans-serif; padding: 12px 22px; border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,.6); transition: opacity .3s; }
      #fx-cap:empty { opacity: 0; }
      #fx-title { position: fixed; inset: 0; z-index: 9997; display: grid; place-items: center; background: #0a0e15; color: #fff; text-align: center; font-family: Inter, sans-serif; transition: opacity .6s; }
      #fx-title h1 { font-size: 72px; font-weight: 900; font-style: italic; margin: 0; letter-spacing: -2px; }
      #fx-title h1 span { background: #00e676; color: #0a0e15; padding: 0 12px; border-radius: 8px; font-style: normal; margin: 0 4px; }
      #fx-title p { font-size: 24px; color: #8291ab; margin-top: 14px; }`;
    document.head.appendChild(st);
    const c = document.createElement("div"); c.id = "fx-cursor"; document.body.appendChild(c);
    const cap = document.createElement("div"); cap.id = "fx-cap"; document.body.appendChild(cap);
    document.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    document.addEventListener("mousedown", () => c.classList.add("down"), true);
    document.addEventListener("mouseup", () => c.classList.remove("down"), true);
  });
});

const wait = (ms) => page.waitForTimeout(ms);
const caption = (t) => page.evaluate((t) => (document.getElementById("fx-cap").textContent = t), t);
let mx = W / 2, my = H / 2;
async function moveTo(x, y, steps = 25) {
  await page.mouse.move(x, y, { steps });
  mx = x; my = y;
}
async function click(sel, { pause = 350 } = {}) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: "visible", timeout: 10000 });
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  await moveTo(box.x + box.width / 2, box.y + box.height / 2);
  await wait(pause);
  await page.mouse.down(); await wait(90); await page.mouse.up();
}
async function type(sel, text, delay = 38) {
  await click(sel);
  await page.locator(sel).first().pressSequentially(text, { delay });
}
async function scrollMain(dy, steps = 12) {
  await moveTo(620, 500, 8);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await wait(30); }
}
async function titleCard(html, ms) {
  await page.evaluate((html) => {
    const d = document.createElement("div"); d.id = "fx-title"; d.innerHTML = html; document.body.appendChild(d);
  }, html);
  await wait(ms);
  await page.evaluate(() => { const d = document.getElementById("fx-title"); d.style.opacity = 0; setTimeout(() => d.remove(), 700); });
  await wait(700);
}
async function setAs(id) {
  const box = await page.locator("#asSelect").boundingBox();
  await moveTo(box.x + box.width / 2, box.y + box.height / 2);
  await wait(300);
  await page.selectOption("#asSelect", id);
  await wait(900);
}

/* ------------------------------ the demo ------------------------------ */
await page.goto("http://localhost:3000");
await titleCard(`<div><h1>Bet<span>On</span>Me</h1><p>Bet on yourself. Your friends will collect.</p></div>`, 3200);

// 1. The board
await caption("Your friends' habits as a live betting board. Everyone bets on themselves to build a habit.");
await moveTo(700, 240); await wait(3600);
await caption("Miss a day and you owe the punishment you picked, recorded and posted for the squad.");
await moveTo(640, 400); await wait(3400);
await scrollMain(780); await wait(800);
await caption("Proof gets posted every day, and an AI referee checks it against the bet's terms.");
await moveTo(330, 640); await wait(4200);
await scrollMain(-780); await wait(300);

// 2. AI coach builds a bet
await caption("Setting a goal? The AI coach turns a vague intention into a bet you can actually win.");
await type("#goalText", "i want to get back into running but i always quit after like 3 days");
await wait(400);
await click("[data-act=coach]");
await caption("It makes the goal specific and provable, sets honest odds, and drafts the punishments.");
await wait(3400);
await moveTo(1250, 420); await wait(3200);
await click("[data-act=dur][data-d='14']"); await wait(500);
await click("[data-act=pun][data-i='2']"); await wait(900);
await caption("Pick the stakes, tag your refs, and lock it in.");
await page.locator("#slip").evaluate((el) => el.closest(".slip").scrollTo({ top: 400, behavior: "smooth" }));
await wait(1200);
await click("[data-act=place]"); await wait(3400);

// 3. Post proof on today's bet
await caption("Now Alex posts today's proof for their gym bet...");
await click("#content .card.mine [data-act=checkin]"); await wait(600);
await page.setInputFiles("#file", path.join(ASSETS, "alex-workout.png"));
await wait(900);
await type("#cap", "21 min HIIT. legs are gone 💀", 45);
await click("#submitUp");
await caption("...and the AI ref reviews the screenshot. If it rejects a legit photo, friends can overrule it.");
await wait(3800);
await click("#submitUp"); await wait(900);

// 4. Friends back or fade
await caption("Friends back you or fade you with squad coins. No real money, just bragging rights.");
await setAs("sam");
const alexCard = "#content .card:has-text('Show Up Sweaty')";
await page.locator(alexCard).scrollIntoViewIfNeeded();
await click(`${alexCard} [data-act=wager][data-side=back]`); await wait(500);
await click(`${alexCard} [data-act=stake][data-amt='100']`); await wait(1600);
await click(`${alexCard} [data-act=react][data-e='💪']`); await wait(500);
await click(`${alexCard} [data-act=comments]`); await wait(400);
await type(`${alexCard} .comment-form input`, "100 coins on you. do NOT make me regret this 🔒", 30);
await page.keyboard.press("Enter"); await wait(2800);

// 5. End of day: someone busts
await caption("Midnight hits. Priya never posted her 10 pages...");
await scrollMain(-2000, 4);
await click("#advanceBtn"); await wait(3800);
await caption("BUSTED. The AI writes the breaking-news headline, and her punishment is now owed.");
await wait(3600);
await click("[data-act=close-bust]"); await wait(1400);

// 6. Pay up on the Wall of Shame
await caption("Priya pays up on the Wall of Shame...");
await setAs("priya");
await click("#content [data-act=punish]"); await wait(500);
await page.setInputFiles("#file", path.join(ASSETS, "priya-punishment.mp4"));
await wait(1200);
await type("#cap", "a tragedy in three acts. see you all tomorrow 📚", 35);
await click("#submitUp"); await wait(1500);
await page.evaluate(() => document.querySelector("#content video")?.play());
await caption("...and the whole squad gets to watch. Losing is public, and it's funny.");
await wait(3500);
await setAs("jordan");
await click("#content .card:first-child [data-act=react][data-e='😂']"); await wait(600);
await click("#content .card:first-child [data-act=react][data-e='🫡']"); await wait(1600);

// 7. Standings
await caption("Squad standings track who keeps their word. Your friends keep you accountable.");
await click("[data-view=squad]"); await wait(4800);
await caption("");
await titleCard(`<div><h1>Bet<span>On</span>Me</h1><p>AI sets the line. Your friends keep you honest.</p></div>`, 3200);

const video = page.video();
await ctx.close();
await browser.close();
const webm = await video.path();
const mp4 = path.join(OUT, "betonme-demo.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
fs.rmSync(webm);
const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString().trim();
console.log(`wrote ${mp4} (${(+dur).toFixed(1)}s)`);
