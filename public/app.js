const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const toAmerican = (pct) => (pct >= 50 ? `-${Math.round((pct / (100 - pct)) * 100)}` : `+${Math.round(((100 - pct) / pct) * 100)}`);
const peppers = (n) => "🌶️".repeat(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REACTIONS = ["🔥", "💪", "😂", "🫡", "👀"];

let S = null; // server state
let me = localStorage.getItem("me") || "alex";
let view = "board";
let filter = "all";
let openWager = null; // {id, side}
const openComments = new Set();
let slip = { phase: "input", text: "", coach: null, punIdx: 0, custom: "", duration: 7, refs: null };

async function api(path, body, isForm) {
  const opts = body ? { method: "POST", ...(isForm ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) } : {};
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

const user = (id) => S.users.find((u) => u.id === id) || { name: "?", color: "#888" };
const avatar = (id, sm) => { const u = user(id); return `<div class="avatar ${sm ? "sm" : ""}" style="background:${u.color}">${esc(u.name[0])}</div>`; };

function toast(msg, bad) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.innerHTML = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

async function load() {
  S = await api("/api/state");
  render();
  loadTicker();
}

async function loadTicker() {
  const t = await api("/api/ticker").catch(() => null);
  if (!t) return;
  const spans = t.lines.map((l) => `<span>${esc(l)}</span>`).join("");
  $("#ticker").innerHTML = spans + spans; // doubled for a seamless loop
  $("#aiTag").textContent = t.source === "claude" ? "AI · CLAUDE" : "AI";
}

/* ---------------- rendering ---------------- */

function render() {
  $("#dayLabel").textContent = `DAY ${S.day}`;
  const meU = user(me);
  $("#coins").textContent = `🪙 ${meU.coins.toLocaleString()}`;
  $("#asSelect").innerHTML = S.users.map((u) => `<option value="${u.id}" ${u.id === me ? "selected" : ""}>${esc(u.name)}</option>`).join("");
  document.querySelectorAll(".nav").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
  $("#filters").classList.toggle("hidden", view !== "board");
  const titles = { board: "Live Board", mine: "My Bets", shame: "Wall of Shame 💀", squad: "Squad Standings" };
  $("#viewTitle").textContent = titles[view];

  let html = "";
  if (view === "squad") html = renderSquad();
  else {
    let bets = S.bets;
    if (view === "mine") bets = bets.filter((b) => b.userId === me);
    if (view === "shame") bets = bets.filter((b) => b.status === "busted");
    if (view === "board") {
      if (filter === "due") bets = bets.filter((b) => b.status === "active" && !b.checkedInToday);
      if (filter === "fire") bets = bets.filter((b) => b.status === "active" && b.streak >= 3);
      if (filter === "settled") bets = bets.filter((b) => b.status !== "active");
      // Live bets first, then settled.
      bets = [...bets].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1));
    }
    html = bets.map((b) => (view === "shame" ? shameCard(b) : betCard(b))).join("") ||
      `<div class="empty">${view === "mine" ? "No bets yet. Use the Bet Slip to bet on yourself →" : view === "shame" ? "Nobody's busted. Yet. 👀" : "Nothing here."}</div>`;
  }
  $("#content").innerHTML = html;
  renderSlip();
}

function statusPill(b) {
  if (b.status === "busted") return `<span class="pill bust">💀 Busted</span>`;
  if (b.status === "won") return `<span class="pill won">🏆 Cashed</span>`;
  if (b.pending) return `<span class="pill won">🗓️ Starts tomorrow</span>`;
  if (b.checkedInToday) return `<span class="pill ok">✓ Locked in today</span>`;
  return `<span class="pill due">⏰ Due today</span>`;
}

function dots(b) {
  let out = "";
  for (let i = 0; i < b.durationDays; i++) {
    const day = b.startDay + i;
    const hit = b.checkins.some((c) => c.day === day && (c.approved || c.overruledBy.length));
    let cls = hit ? "hit" : "";
    if (!hit && b.status === "busted" && day === b.bustDay) cls = "miss";
    else if (!hit && b.status === "active" && day === S.day) cls = "today";
    out += `<div class="dot ${cls}" title="Day ${i + 1}"></div>`;
  }
  return out;
}

function proofBlock(b) {
  const c = [...b.checkins].reverse().find((x) => x.file || x.day === S.day);
  if (!c || (!c.file && c.day !== S.day)) return "";
  const ok = c.approved || c.overruledBy.length;
  const media = c.file ? (c.mime?.startsWith("video") ? `<video src="${c.file}" muted></video>` : `<img src="${c.file}" data-zoom="${c.file}" alt="proof">`) : "";
  const overrule = !c.approved && !c.overruledBy.length && b.userId !== me && b.status === "active" && c.day === S.day
    ? `<button class="btn ghost small" data-act="overrule" data-id="${b.id}" style="margin-top:6px">✋ Overrule the AI ref</button>` : "";
  const overruled = c.overruledBy.length ? ` · overruled by ${c.overruledBy.map((u) => esc(user(u).name)).join(", ")}` : "";
  return `<div class="proof">${media}<div>
    <span class="ref ${ok ? "yes" : "no"}">🤖 AI REF: ${c.approved ? "APPROVED" : "NOT CONVINCED"} · ${c.confidence}%${overruled}</span>
    <div class="hype">${esc(c.approved ? c.hype : c.reason)}</div>
    ${c.caption ? `<div class="caption">“${esc(c.caption)}”</div>` : ""}
    ${overrule}</div></div>`;
}

function marketBlock(b) {
  const mine = b.userId === me;
  const closed = b.status !== "active";
  const myBack = b.backers.filter((w) => w.userId === me).reduce((s, w) => s + w.amount, 0);
  const myFade = b.faders.filter((w) => w.userId === me).reduce((s, w) => s + w.amount, 0);
  const dis = mine || closed ? "disabled" : "";
  let html = `<div class="market">
    <button class="odds back" data-act="wager" data-side="back" data-id="${b.id}" ${dis}>
      <span class="side">BACK ${esc(user(b.userId).name.toUpperCase())}<small>🪙 ${b.backPool} pool${myBack ? ` · you ${myBack}` : ""}</small></span><span class="line">${b.line}</span></button>
    <button class="odds fade" data-act="wager" data-side="fade" data-id="${b.id}" ${dis}>
      <span class="side">FADE<small>🪙 ${b.fadePool} pool${myFade ? ` · you ${myFade}` : ""}</small></span><span class="line">${toAmerican(100 - b.successPct)}</span></button>
  </div>`;
  if (openWager?.id === b.id) {
    html += `<div class="stake-row"><span class="muted tiny">${openWager.side === "back" ? "Back" : "Fade"} with:</span>
      ${[25, 50, 100].map((a) => `<button class="chip" data-act="stake" data-id="${b.id}" data-amt="${a}">🪙 ${a}</button>`).join("")}
      <button class="chip" data-act="cancel-wager">✕</button></div>`;
  }
  return html;
}

function footer(b) {
  const reacts = REACTIONS.map((e) => {
    const list = b.reactions[e] || [];
    return `<button class="react ${list.includes(me) ? "on" : ""}" data-act="react" data-id="${b.id}" data-e="${e}">${e}${list.length ? ` ${list.length}` : ""}</button>`;
  }).join("");
  const open = openComments.has(b.id);
  let html = `<div class="card-foot">${reacts}<div class="foot-right">
    <button class="react" data-act="comments" data-id="${b.id}">💬 ${b.comments.length}</button></div></div>`;
  if (open) {
    html += `<div class="comments">${b.comments.map((c) => `<div class="comment">${avatar(c.userId, true)}<div><b>${esc(user(c.userId).name)}</b>${esc(c.text)}</div></div>`).join("")}
      <form class="comment-form" data-id="${b.id}"><input placeholder="Talk your talk…" name="t" autocomplete="off"/><button class="btn small">Send</button></form></div>`;
  }
  return html;
}

function betCard(b) {
  const mine = b.userId === me;
  let action = "";
  if (mine && b.status === "active" && !b.checkedInToday && !b.pending)
    action = `<button class="btn block" style="margin-top:14px" data-act="checkin" data-id="${b.id}">📸 Post today's proof</button>`;
  if (mine && b.status === "busted" && !b.punishmentProof)
    action = `<button class="btn red block" style="margin-top:14px" data-act="punish" data-id="${b.id}">🎥 Upload your punishment</button>`;
  return `<div class="card ${mine ? "mine" : ""}" id="card-${b.id}">
    <div class="card-top">${avatar(b.userId)}<div class="who"><b>${esc(b.user)}</b>${mine ? ` <span class="muted">(you)</span>` : ""}<br>
      <span class="muted">${b.pending ? `${b.durationDays}-day bet · kicks off tomorrow` : `Day ${b.dayIndex} of ${b.durationDays} · ${b.streak}🔥 streak`}</span></div>${statusPill(b)}</div>
    <div class="card-body">
      <div class="bet-title">${esc(b.title)}</div>
      <div class="bet-goal">${esc(b.goal)}</div>
      <div class="dots">${dots(b)}</div>
      ${b.status === "busted" && b.headline ? `<div class="shame-head" style="margin-top:10px">🚨 ${esc(b.headline)}</div>` : ""}
      ${marketBlock(b)}
      <div class="stakes"><span class="lbl">${b.status === "busted" ? "PUNISHMENT OWED" : "IF THEY MISS A DAY"} ${peppers(b.spice)}</span>${esc(b.punishment)}</div>
      ${b.status === "busted" && b.punishmentProof ? `<div class="shame-media" style="margin-top:12px">${mediaTag(b.punishmentProof)}</div>` : ""}
      ${b.status !== "busted" ? proofBlock(b) : ""}
      ${action}
    </div>
    ${footer(b)}
  </div>`;
}

const mediaTag = (p) => (p.mime?.startsWith("video") ? `<video src="${p.file}" controls playsinline muted autoplay loop></video>` : `<img src="${p.file}" alt="punishment">`);

function shameCard(b) {
  const mine = b.userId === me;
  return `<div class="card" id="card-${b.id}">
    <div class="card-top">${avatar(b.userId)}<div class="who"><b>${esc(b.user)}</b><br><span class="muted">Busted on day ${b.bustDay - b.startDay + 1} of ${b.durationDays} · "${esc(b.title)}"</span></div>
      ${b.punishmentProof ? `<span class="pill won">✓ Paid up</span>` : `<span class="pill bust">⌛ Owes the squad</span>`}</div>
    <div class="card-body">
      <div class="shame-head">🚨 ${esc(b.headline || "Streak snapped.")}</div>
      <div class="stakes"><span class="lbl">THE PUNISHMENT ${peppers(b.spice)}</span>${esc(b.punishment)}</div>
      ${b.punishmentProof
        ? `<div class="shame-media">${mediaTag(b.punishmentProof)}</div>${b.punishmentProof.caption ? `<div class="caption" style="margin-top:8px">“${esc(b.punishmentProof.caption)}”</div>` : ""}`
        : mine ? `<button class="btn red block" style="margin-top:14px" data-act="punish" data-id="${b.id}">🎥 Upload your punishment</button>`
               : `<div class="owed">The squad is waiting on ${esc(b.user)}'s recording… 👀</div>`}
    </div>${footer(b)}</div>`;
}

function renderSquad() {
  const rec = (id) => {
    const mine = S.bets.filter((b) => b.userId === id);
    return `${mine.filter((b) => b.status === "won").length}-${mine.filter((b) => b.status === "busted").length}`;
  };
  const live = (id) => S.bets.filter((b) => b.userId === id && b.status === "active").length;
  const rows = [...S.users].sort((a, b) => b.coins - a.coins).map((u, i) => `<div class="squad-row">
    <span class="rank">${i === 0 ? "👑" : i + 1}</span><div style="display:flex;gap:10px;align-items:center">${avatar(u.id)}<b>${esc(u.name)}${u.id === me ? ' <span class="muted">(you)</span>' : ""}</b></div>
    <span class="mono">${rec(u.id)}</span><span class="mono">${live(u.id)}</span><span class="mono" style="color:var(--amber)">🪙 ${u.coins}</span></div>`).join("");
  return `<div class="squad"><div class="squad-row head"><span>#</span><span>Friend</span><span>W-L</span><span>Live</span><span>Coins</span></div>${rows}</div>`;
}

/* ---------------- bet slip (AI coach) ---------------- */

function renderSlip() {
  const el = $("#slip");
  if (slip.phase === "loading") {
    el.innerHTML = `<div class="thinking"><b>🤖 Coach is setting your line…</b><div class="muted tiny" style="margin-top:4px">Making it specific, provable, and actually winnable</div>
      <div class="shimmer" style="width:90%"></div><div class="shimmer" style="width:70%"></div><div class="shimmer" style="width:80%"></div></div>`;
    return;
  }
  if (slip.phase === "input") {
    el.innerHTML = `<div style="font-weight:800;font-size:17px">Bet on yourself.</div>
      <div class="muted" style="margin-top:4px;font-size:13px">Say what you want to get better at. The AI coach turns it into a bet you can actually win, sets your odds, and drafts the punishment.</div>
      <label class="f">What do you want to lock in?</label>
      <textarea id="goalText" placeholder="e.g. I want to start running, like a mile a day">${esc(slip.text)}</textarea>
      <div class="suggest">${["run a mile every day", "read more", "sleep before midnight", "less TikTok", "drink more water"].map((s) => `<button class="chip" data-act="suggest">${s}</button>`).join("")}</div>
      <button class="btn block ai-btn" data-act="coach">✨ Ask the AI Coach</button>`;
    return;
  }
  const c = slip.coach;
  const friends = S.users.filter((u) => u.id !== me);
  if (!slip.refs) slip.refs = new Set(friends.map((u) => u.id));
  const custom = slip.punIdx === -1;
  el.innerHTML = `
    <label class="f" style="margin-top:0">Your bet</label>
    <input id="sTitle" value="${esc(c.title)}" style="font-weight:800;font-size:16px"/>
    <label class="f">Daily goal</label><textarea id="sGoal" rows="2">${esc(c.goal)}</textarea>
    <label class="f">Proof required</label><div class="muted" style="font-size:13px">📸 ${esc(c.proof)}</div>
    <div class="oddsbox"><div><div class="big">${c.line}</div><div class="pct">${c.successPct}% to hit</div></div>
      <div class="why">🎙️ ${esc(c.oddsReasoning)}</div></div>
    <label class="f">Length</label>
    <div class="durs">${[3, 7, 14, 30].map((d) => `<button class="chip ${slip.duration === d ? "active" : ""}" data-act="dur" data-d="${d}">${d} days${d === c.durationDays ? " ★" : ""}</button>`).join("")}</div>
    <label class="f">If you miss a day, you…</label>
    <div class="pun">${c.punishments.map((p, i) => `<button class="pun-opt ${slip.punIdx === i ? "sel" : ""}" data-act="pun" data-i="${i}"><span class="pepper">${peppers(p.spice)}</span><span>${esc(p.text)}</span></button>`).join("")}
      <button class="pun-opt ${custom ? "sel" : ""}" data-act="pun" data-i="-1"><span class="pepper">✍️</span><span>Write my own</span></button>
      ${custom ? `<input id="sCustom" placeholder="Your punishment…" value="${esc(slip.custom)}"/>` : ""}</div>
    <label class="f">Refs (friends who keep you honest)</label>
    <div class="refs">${friends.map((u) => `<button class="ref-opt ${slip.refs.has(u.id) ? "sel" : ""}" data-act="ref" data-u="${u.id}">${avatar(u.id, true)}${esc(u.name)}</button>`).join("")}</div>
    <div class="tip">💡 <b>Coach's tip:</b> ${esc(c.tip)}</div>
    <div class="slip-summary">
      <button class="btn block" data-act="place">🔒 Lock it in</button>
      <button class="btn ghost block small" style="margin-top:8px" data-act="restart">← Start over</button>
    </div>`;
}

/* ---------------- modals ---------------- */

function openModal(html) { $("#modal").innerHTML = html; $("#modalBg").classList.remove("hidden"); }
function closeModal() { $("#modalBg").classList.add("hidden"); }

function uploadModal(b, kind) {
  const isPunish = kind === "punish";
  openModal(`<h2>${isPunish ? "🎥 Pay up" : "📸 Post today's proof"}</h2>
    <div class="muted">${isPunish ? esc(b.punishment) : `<b>${esc(b.title)}</b> · ${esc(b.proof)}`}</div>
    <label class="drop" id="drop"><span>${isPunish ? "Drop your video or photo" : "Tap to add your photo"}</span>
      <input type="file" id="file" accept="${isPunish ? "video/*,image/*" : "image/*"}"/></label>
    <label class="f">Caption</label><input id="cap" placeholder="${isPunish ? "any last words?" : "how'd it go?"}"/>
    <div id="verdict"></div>
    <div class="modal-actions"><button class="btn ghost" data-act="close">Cancel</button>
      <button class="btn ${isPunish ? "red" : ""}" id="submitUp" data-act="${isPunish ? "submit-punish" : "submit-checkin"}" data-id="${b.id}">${isPunish ? "Post to the Wall" : "Send to the AI ref"}</button></div>`);
  $("#file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const media = f.type.startsWith("video") ? `<video src="${url}" autoplay muted loop></video>` : `<img src="${url}">`;
    $("#drop").innerHTML = media;
    $("#drop").appendChild(e.target);
  });
}

function showBust(events) {
  const busts = events.filter((e) => e.type === "busted");
  if (!busts.length) return;
  const e = busts[0];
  const b = S.bets.find((x) => x.id === e.betId);
  $("#bust").innerHTML = `<div class="bust-inner"><span class="bust-tag">BUSTED</span><h2>${esc(e.headline)}</h2>
    <p>${esc(e.user)} now owes the squad: <b>${esc(b?.punishment || "")}</b></p>
    ${busts.length > 1 ? `<p class="muted">+${busts.length - 1} more busted</p>` : ""}
    <button class="btn red" data-act="close-bust" style="margin-top:14px">To the Wall of Shame 💀</button></div>`;
  $("#bust").classList.remove("hidden");
}

/* ---------------- events ---------------- */

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-act], .nav, .chip[data-f], [data-zoom]");
  if (!t) return;
  if (t.classList.contains("nav")) { view = t.dataset.view; openWager = null; return render(); }
  if (t.dataset.f) {
    filter = t.dataset.f;
    document.querySelectorAll("[data-f]").forEach((c) => c.classList.toggle("active", c === t));
    return render();
  }
  if (t.dataset.zoom && !t.dataset.act) return openModal(`<img src="${t.dataset.zoom}" style="width:100%;border-radius:12px"><div class="modal-actions"><button class="btn ghost" data-act="close">Close</button></div>`);

  const id = t.dataset.id;
  const b = S.bets.find((x) => x.id === id);
  try {
    switch (t.dataset.act) {
      case "suggest": slip.text = t.textContent; renderSlip(); break;
      case "coach": {
        slip.text = $("#goalText").value;
        if (!slip.text.trim()) return toast("Tell the coach what you want to work on", true);
        slip.phase = "loading"; renderSlip();
        try {
          [slip.coach] = await Promise.all([api("/api/ai/coach", { text: slip.text, as: me }), sleep(1200)]);
          slip.duration = [3, 7, 14, 30].reduce((a, d) => (Math.abs(d - slip.coach.durationDays) < Math.abs(a - slip.coach.durationDays) ? d : a), 7);
          slip.punIdx = 1; slip.phase = "result"; slip.refs = null;
        } catch (e) { slip.phase = "input"; toast(e.message, true); }
        renderSlip(); break;
      }
      case "dur": slip.duration = +t.dataset.d; renderSlip(); break;
      case "pun": slip.punIdx = +t.dataset.i; renderSlip(); if (slip.punIdx === -1) $("#sCustom").focus(); break;
      case "ref": slip.refs.has(t.dataset.u) ? slip.refs.delete(t.dataset.u) : slip.refs.add(t.dataset.u); renderSlip(); break;
      case "restart": slip = { phase: "input", text: slip.text, coach: null, punIdx: 1, custom: "", duration: 7, refs: null }; renderSlip(); break;
      case "place": {
        const c = slip.coach;
        const pun = slip.punIdx === -1 ? { text: $("#sCustom").value, spice: 2 } : c.punishments[slip.punIdx];
        if (!pun.text?.trim()) return toast("Pick a punishment. No risk, no reward.", true);
        const bet = await api("/api/bets", {
          as: me, title: $("#sTitle").value, goal: $("#sGoal").value, proof: c.proof, durationDays: slip.duration,
          punishment: pun.text, spice: pun.spice, successPct: c.successPct, line: c.line, oddsReasoning: c.oddsReasoning,
          tip: c.tip, refs: [...slip.refs],
        });
        slip = { phase: "input", text: "", coach: null, punIdx: 1, custom: "", duration: 7, refs: null };
        view = "board"; filter = "all";
        document.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("active", x.dataset.f === "all"));
        await load();
        $(`#card-${bet.id}`)?.classList.add("flash");
        toast(`🔒 Bet placed: <b>${esc(bet.title)}</b> at ${bet.line}. Your refs have been notified.`);
        break;
      }
      case "wager": openWager = openWager?.id === id && openWager.side === t.dataset.side ? null : { id, side: t.dataset.side }; render(); break;
      case "cancel-wager": openWager = null; render(); break;
      case "stake": {
        const side = openWager.side;
        await api(`/api/bets/${id}/wager`, { as: me, side, amount: +t.dataset.amt });
        openWager = null;
        await load();
        $("#coins").classList.add("bump"); setTimeout(() => $("#coins").classList.remove("bump"), 250);
        toast(side === "back" ? `🤝 You backed ${esc(b.user)} for 🪙 ${t.dataset.amt}` : `😈 You faded ${esc(b.user)} for 🪙 ${t.dataset.amt}`);
        break;
      }
      case "react": await api(`/api/bets/${id}/react`, { as: me, emoji: t.dataset.e }); await load(); break;
      case "comments": openComments.has(id) ? openComments.delete(id) : openComments.add(id); render(); $(`.comment-form[data-id="${id}"] input`)?.focus(); break;
      case "overrule": await api(`/api/bets/${id}/overrule`, { as: me }); await load(); toast("✋ Overruled. The squad has spoken."); break;
      case "checkin": uploadModal(b, "checkin"); break;
      case "punish": uploadModal(b, "punish"); break;
      case "close": closeModal(); break;
      case "close-bust": $("#bust").classList.add("hidden"); view = "shame"; render(); break;
      case "submit-checkin":
      case "submit-punish": {
        const f = $("#file").files[0];
        if (!f) return toast("Add a file first", true);
        const fd = new FormData();
        fd.append("file", f); fd.append("caption", $("#cap").value); fd.append("as", me);
        t.disabled = true;
        if (t.dataset.act === "submit-punish") {
          t.textContent = "Uploading…";
          await api(`/api/bets/${id}/punishment`, fd, true);
          closeModal(); view = "shame"; await load();
          toast("💀 Punishment posted. Respect. The squad can see it now.");
          break;
        }
        t.textContent = "🤖 AI ref is reviewing the tape…";
        const [{ checkin }] = await Promise.all([api(`/api/bets/${id}/checkin`, fd, true), sleep(1400)]);
        $("#verdict").innerHTML = `<div class="verdict ${checkin.approved ? "yes" : "no"}">
          <span class="ref ${checkin.approved ? "yes" : "no"}">🤖 AI REF: ${checkin.approved ? "APPROVED" : "NOT CONVINCED"} · ${checkin.confidence}%</span>
          <div class="hype" style="font-size:16px">${esc(checkin.approved ? checkin.hype : checkin.reason)}</div>
          <div class="caption">${checkin.approved ? esc(checkin.reason) : "Your friends can still overrule the ref, or try a clearer photo."}</div></div>`;
        t.textContent = "Done"; t.disabled = false; t.dataset.act = "close";
        await load();
        break;
      }
    }
  } catch (e) {
    toast(e.message, true);
    t.disabled = false;
  }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest(".comment-form");
  if (!form) return;
  ev.preventDefault();
  const text = form.t.value;
  if (!text.trim()) return;
  await api(`/api/bets/${form.dataset.id}/comment`, { as: me, text });
  await load();
  $(`.comment-form[data-id="${form.dataset.id}"] input`)?.focus();
});

// Keep slip edits across re-renders.
document.addEventListener("input", (e) => {
  if (e.target.id === "goalText") slip.text = e.target.value;
  if (e.target.id === "sTitle") slip.coach.title = e.target.value;
  if (e.target.id === "sGoal") slip.coach.goal = e.target.value;
  if (e.target.id === "sCustom") slip.custom = e.target.value;
});

$("#modalBg").addEventListener("click", (e) => { if (e.target.id === "modalBg") closeModal(); });
$("#asSelect").addEventListener("change", (e) => { me = e.target.value; localStorage.setItem("me", me); openWager = null; slip.refs = null; render(); toast(`Now viewing as <b>${esc(user(me).name)}</b>`); });
$("#advanceBtn").addEventListener("click", async () => {
  const btn = $("#advanceBtn");
  btn.disabled = true; btn.textContent = "⏳ Settling…";
  try {
    const { events } = await api("/api/demo/advance", {});
    await load();
    for (const e of events.filter((x) => x.type === "won")) toast(`🏆 ${esc(e.user)} cashed "${esc(e.title)}"! Backers paid out.`);
    showBust(events);
    if (!events.length) toast(`☀️ Day ${S.day}. Everyone made it. New day, new proof.`);
  } finally { btn.disabled = false; btn.textContent = "⏭ End Day"; }
});

load();
setInterval(async () => {
  // Light polling so friends see each other's updates.
  const s = await api("/api/state").catch(() => null);
  if (s && s.version !== S.version && $("#modalBg").classList.contains("hidden") && !document.activeElement?.matches("input, textarea")) {
    S = s; render(); loadTicker();
  }
}, 4000);
