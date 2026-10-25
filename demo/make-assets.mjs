// Generates placeholder demo media (tracker screenshots + "phone recording" punishment clips).
// Swap these for real photos/videos from your friends for the best demo.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const SEED = path.join(ROOT, "seed-media");
const DEMO = path.join(ROOT, "demo", "assets");
fs.mkdirSync(SEED, { recursive: true });
fs.mkdirSync(DEMO, { recursive: true });

const font = `font-family: -apple-system, 'Segoe UI', Inter, sans-serif;`;

const tracker = ({ color, label, big, unit, stats, date, route }) => `
<body style="margin:0;background:#111;${font}color:#fff;width:390px;height:560px;overflow:hidden">
  <div style="padding:18px 20px 0;display:flex;justify-content:space-between;font-size:13px;color:#aaa"><span>9:41</span><span>●●● ▮</span></div>
  <div style="padding:10px 20px"><div style="font-size:13px;color:${color};font-weight:700;letter-spacing:1px">${label}</div>
  <div style="font-size:13px;color:#999;margin-top:2px">${date}</div></div>
  <svg width="390" height="200" style="background:#1d2a22">
    <defs><pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#2a3a30" stroke-width="1"/></pattern></defs>
    <rect width="390" height="200" fill="url(#g)"/>
    <path d="${route}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <div style="padding:16px 20px"><div style="font-size:64px;font-weight:800;letter-spacing:-2px">${big}<span style="font-size:22px;color:#aaa;margin-left:6px">${unit}</span></div>
  <div style="display:flex;gap:28px;margin-top:10px">${stats.map(([k, v]) => `<div><div style="font-size:22px;font-weight:700">${v}</div><div style="font-size:12px;color:#999">${k}</div></div>`).join("")}</div></div>
</body>`;

const recording = ({ bg, emoji, lines, who }) => `
<body style="margin:0;width:640px;height:800px;overflow:hidden;${font}background:${bg};color:#fff;position:relative">
  <style>
    @keyframes bob { 0%,100% { transform: translateY(0) rotate(-6deg);} 50% { transform: translateY(-40px) rotate(6deg);} }
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes sub { 0% { opacity:0; transform: translateY(10px);} 10%,90% { opacity:1; transform:none;} 100% { opacity:0;} }
    .spot { position:absolute; inset:0; background: radial-gradient(circle at 50% 45%, rgba(255,255,255,.35), transparent 55%); }
    .guy { position:absolute; left:50%; top:30%; font-size:220px; margin-left:-130px; animation: bob .9s ease-in-out infinite; }
    .sub { position:absolute; bottom:120px; width:100%; text-align:center; font-size:34px; font-weight:800; text-shadow:0 3px 10px #000; opacity:0; }
  </style>
  <div class="spot"></div><div class="guy">${emoji}</div>
  <div style="position:absolute;top:24px;left:24px;font-weight:800;font-size:22px"><span style="color:#ff3d57;animation:blink 1s infinite">●</span> REC</div>
  <div style="position:absolute;top:24px;right:24px;font-size:18px;opacity:.85">${who}</div>
  ${lines.map((l, i) => `<div class="sub" style="animation: sub 2.4s ${i * 2.4}s forwards">${l}</div>`).join("")}
  <div style="position:absolute;bottom:30px;left:50%;margin-left:-36px;width:72px;height:72px;border-radius:50%;border:5px solid #fff;box-sizing:border-box"></div>
</body>`;

const browser = await chromium.launch({ channel: "chrome" });

async function shot(html, file) {
  const page = await browser.newPage({ viewport: { width: 390, height: 560 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: file });
  await page.close();
  console.log("wrote", file);
}

async function clip(html, file, seconds) {
  const tmp = path.join(ROOT, "demo", "out", "tmp-" + path.basename(file, ".mp4"));
  fs.mkdirSync(tmp, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 800 }, recordVideo: { dir: tmp, size: { width: 640, height: 800 } } });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForTimeout(seconds * 1000);
  const video = page.video();
  await ctx.close();
  const webm = await video.path();
  // Trim the blank first frames, add a quiet tone so it reads as a real clip, encode to H.264 for every browser.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.4", "-i", webm, "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100",
    "-filter:a", "volume=0.05", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", file]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("wrote", file);
}

await shot(tracker({
  color: "#fc4c02", label: "MORNING RUN", date: "Today at 7:12 AM", big: "1.31", unit: "mi",
  stats: [["Pace", "9:42 /mi"], ["Time", "12:42"], ["Elev", "38 ft"]],
  route: "M40 160 C 80 120, 90 60, 150 70 S 230 140, 280 90 S 350 40, 340 120 S 220 180, 160 150",
}), path.join(SEED, "jordan-run.png"));

await shot(tracker({
  color: "#00e676", label: "STRENGTH · HIIT", date: "Today at 5:48 PM", big: "21:07", unit: "min",
  stats: [["Calories", "214"], ["Avg HR", "148"], ["Sets", "6"]],
  route: "M20 150 L60 150 L75 60 L95 170 L115 90 L150 140 L175 50 L200 160 L230 80 L260 150 L290 70 L320 150 L370 150",
}), path.join(DEMO, "alex-workout.png"));

await clip(recording({
  bg: "linear-gradient(160deg,#3a1c71,#d76d77,#ffaf7b)", emoji: "🦈", who: "Marcus · dining hall",
  lines: ["♪ baby shark doo doo doo doo ♪", "♪ mommy shark doo doo ♪", "(the whole table is filming)"],
}), path.join(SEED, "marcus-punishment.mp4"), 7.5);

await clip(recording({
  bg: "linear-gradient(160deg,#0f2027,#2c5364,#1db954)", emoji: "🎭", who: "Priya · live",
  lines: ["\"Top artist: Taylor Swift.\"", "\"In the top 0.5% of listeners...\"", "\"...a tragedy in three acts.\""],
}), path.join(DEMO, "priya-punishment.mp4"), 7.5);

await browser.close();
