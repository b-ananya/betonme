// Dev helper: screenshot the running app. Usage: node demo/shot.mjs [out.png] [view]
import { chromium } from "playwright";
const [out = "demo/out/shot.png", view] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
await p.goto("http://localhost:3000");
await p.waitForTimeout(800);
if (view) { await p.click(`[data-view=${view}]`); await p.waitForTimeout(400); }
await p.screenshot({ path: out });
await b.close();
