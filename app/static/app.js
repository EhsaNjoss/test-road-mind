/* Roadmind officer dashboard. Plain JavaScript, no external libraries (works offline). */
"use strict";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

const T = {
  en: {
    tagline: "Traffic lights that think about people", junction: "Junction", vehicles: "🚗 Vehicles", people: "👥 People",
    assumptions: "Assumptions", zones: "Draw zones", emergency: "Emergency", cameraTitle: "Live junction camera · AI detection",
    lowConfTitle: "Low confidence", lowConfHint: "Roadmind will not guess — keep the fixed timer.", cancel: "Cancel",
    privacy: "Privacy: no number plates are read and no faces are identified. Roadmind only advises; the officer controls the signals.",
    aiRec: "AI recommendation", speak: "Speak", why: "Why? Show the numbers", accept: "Accept", override: "Override",
    ovSeconds: "Change green time for this road by (seconds)", ovReason: "Reason", ovSave: "Save override",
    officerDecides: "The officer decides · advice only, never controls signals", noZones: "No road zones yet — use “Draw zones”.",
    simTitle: "Roadmind vs fixed timer", simulated: "Simulated", simWait: "Waiting for advice…",
    previewNote: "Next 2 minutes if you accept (people waiting) · grey = fixed timer, colour = Roadmind",
    logTitle: "Decision log", logNote: "Every decision recorded", fcTitle: "Rhythm forecast · next 30 min",
    occTitle: "People per vehicle (assumptions)", occHelp: "Average people in each vehicle type. These are estimates, not exact counts — adjust them for this junction.",
    save: "Save", close: "Close", logDetail: "Decision details",
    peopleTitle: "People waiting per road", vehiclesTitle: "Vehicles per road", rankedPeople: "ranked by people", rankedVehicles: "ranked by vehicles",
    confidence: "Confidence", nextIn: (s) => `next advice in ${s}s`, greenFor: (i, n) => `green for Road ${i}` + extraName(i, n),
    keepPlan: "Current plan fits the traffic", keepFixed: "Low confidence — keep the fixed timer", fixedTimer: "Fixed",
    emFor: (i) => `green first for Road ${i} (emergency, simulated)`, emBar: (i, s) => `Emergency priority (simulated): Road ${i} gets green first · ${s}s left`,
    pedLine: (n, e) => `🚶 ${n} people waiting to cross` + (e ? ` · +${e}s walk time` : ""), queued: "queued", wait: "longest wait",
    personWait: "Avg person wait", vehWait: "Avg vehicle wait", peopleMin: "People moved / min", fixed: "Fixed", roadmind: "Roadmind",
    deltaTxt: (p) => p <= 0 ? `Person waiting time ${p}% with Roadmind (simulated)` : `Person waiting time +${p}% with Roadmind (simulated)`,
    accepted: "Accepted", overridden: "Overridden", pending: "Waiting for officer", low_confidence: "Low confidence", emergencyS: "Emergency", no_response: "No response",
    savedDecision: (s) => `${s} ✓ — recorded in the log`, chooseRoad: "Give green first to:", modelDetects: "Model detects",
    needFinetune: "CNG / rickshaw / leguna need the fine-tuned model", src: { llm: "Phrased by Gemini · numbers from Roadmind", template: "Template · numbers from Roadmind" },
    noVoice: "No Bangla voice on this device — showing text only", rush: (m, e) => `⏰ ${e} rush expected in ${m} min — prepare early`,
    road: "Road", green: "Green", fixedCol: "Fixed", change: "Change", peopleCol: "People", vehiclesCol: "Vehicles",
  },
  bn: {
    tagline: "যে ট্রাফিক বাতি মানুষের কথা ভাবে", junction: "মোড়", vehicles: "🚗 যানবাহন", people: "👥 মানুষ",
    assumptions: "অনুমান", zones: "জোন আঁকুন", emergency: "জরুরি", cameraTitle: "সরাসরি মোড়ের ক্যামেরা · এআই শনাক্তকরণ",
    lowConfTitle: "নিশ্চয়তা কম", lowConfHint: "Roadmind অনুমান করবে না — নির্দিষ্ট টাইমার চালু রাখুন।", cancel: "বাতিল",
    privacy: "গোপনীয়তা: কোনো নম্বর প্লেট পড়া হয় না, কারো মুখ শনাক্ত করা হয় না। Roadmind শুধু পরামর্শ দেয়; সিগন্যাল নিয়ন্ত্রণ করেন অফিসার।",
    aiRec: "এআই পরামর্শ", speak: "শুনুন", why: "কেন? সংখ্যাগুলো দেখুন", accept: "গ্রহণ", override: "পরিবর্তন",
    ovSeconds: "এই রোডের সবুজ সময় কত সেকেন্ড বদলাবেন", ovReason: "কারণ", ovSave: "পরিবর্তন সংরক্ষণ",
    officerDecides: "সিদ্ধান্ত অফিসারের · শুধু পরামর্শ, সিগন্যাল নিয়ন্ত্রণ করে না", noZones: "এখনো কোনো জোন নেই — “জোন আঁকুন” ব্যবহার করুন।",
    simTitle: "Roadmind বনাম নির্দিষ্ট টাইমার", simulated: "সিমুলেশন", simWait: "পরামর্শের অপেক্ষায়…",
    previewNote: "গ্রহণ করলে আগামী ২ মিনিট (অপেক্ষমাণ মানুষ) · ধূসর = নির্দিষ্ট টাইমার, রঙিন = Roadmind",
    logTitle: "সিদ্ধান্তের লগ", logNote: "প্রতিটি সিদ্ধান্ত সংরক্ষিত", fcTitle: "ছন্দ পূর্বাভাস · আগামী ৩০ মিনিট",
    occTitle: "প্রতি যানবাহনে মানুষ (অনুমান)", occHelp: "প্রতিটি যানবাহনে গড়ে কতজন। এগুলো অনুমান, সঠিক গণনা নয় — এই মোড়ের জন্য ঠিক করে নিন।",
    save: "সংরক্ষণ", close: "বন্ধ", logDetail: "সিদ্ধান্তের বিস্তারিত",
    peopleTitle: "প্রতি রোডে অপেক্ষমাণ মানুষ", vehiclesTitle: "প্রতি রোডে যানবাহন", rankedPeople: "মানুষ অনুযায়ী", rankedVehicles: "যানবাহন অনুযায়ী",
    confidence: "নিশ্চয়তা", nextIn: (s) => `পরের পরামর্শ ${bnNum(s)} সেকেন্ডে`, greenFor: (i, n) => `রোড ${bnNum(i)}-এ সবুজ` + extraName(i, n),
    keepPlan: "এখনকার টাইমিং ঠিক আছে", keepFixed: "নিশ্চয়তা কম — নির্দিষ্ট টাইমার রাখুন", fixedTimer: "নির্দিষ্ট",
    emFor: (i) => `রোড ${bnNum(i)}-এ আগে সবুজ (জরুরি, সিমুলেশন)`, emBar: (i, s) => `জরুরি অগ্রাধিকার (সিমুলেশন): রোড ${bnNum(i)} আগে সবুজ পাবে · বাকি ${bnNum(s)} সেকেন্ড`,
    pedLine: (n, e) => `🚶 ${bnNum(n)} জন রাস্তা পার হওয়ার অপেক্ষায়` + (e ? ` · +${bnNum(e)} সেকেন্ড হাঁটার সময়` : ""), queued: "সারিতে", wait: "সবচেয়ে দীর্ঘ অপেক্ষা",
    personWait: "গড় মানুষের অপেক্ষা", vehWait: "গড় যানবাহনের অপেক্ষা", peopleMin: "প্রতি মিনিটে মানুষ পার", fixed: "নির্দিষ্ট", roadmind: "Roadmind",
    deltaTxt: (p) => `Roadmind-এ মানুষের অপেক্ষা ${bnNum(p)}% (সিমুলেশন)`,
    accepted: "গৃহীত", overridden: "পরিবর্তিত", pending: "অফিসারের অপেক্ষায়", low_confidence: "নিশ্চয়তা কম", emergencyS: "জরুরি", no_response: "উত্তর নেই",
    savedDecision: (s) => `${s} ✓ — লগে সংরক্ষিত`, chooseRoad: "আগে সবুজ দিন:", modelDetects: "মডেল শনাক্ত করে",
    needFinetune: "সিএনজি / রিকশা / লেগুনার জন্য ফাইন-টিউন করা মডেল লাগবে", src: { llm: "Gemini দিয়ে লেখা · সংখ্যা Roadmind-এর", template: "টেমপ্লেট · সংখ্যা Roadmind-এর" },
    noVoice: "এই ডিভাইসে বাংলা ভয়েস নেই — শুধু লেখা দেখানো হচ্ছে", rush: (m, e) => `⏰ ${bnNum(m)} মিনিটে ${e} ভিড় আসতে পারে — আগে প্রস্তুত হোন`,
    road: "রোড", green: "সবুজ", fixedCol: "নির্দিষ্ট", change: "পরিবর্তন", peopleCol: "মানুষ", vehiclesCol: "যানবাহন",
  },
};
const REASON_BN = { "Dark": "আলো খুব কম", "Blur / rain": "ছবি ঝাপসা (বৃষ্টি?)", "View blocked": "ক্যামেরার দৃশ্য ঢাকা", "Low detection confidence": "শনাক্তকরণের নিশ্চয়তা কম" };
const TYPE_LABEL = { bus: "🚌 Bus", car: "🚗 Car", cng: "🛺 CNG", rickshaw: "🚲 Rickshaw", battery_rickshaw: "🛺 E-rickshaw", leguna: "🚐 Leguna",
  motorbike: "🏍 Motorbike", bicycle: "🚲 Bicycle", truck: "🚚 Truck", van: "🚐 Van", other: "• Other" };

let lang = "en", view = "people", junctionId = null, es = null, pollTimer = null;
let state = null, adviceId = null, adviceSig = "", lastLogFetch = 0, junctionCache = {}, overrideReasons = [];

const t = (k, ...a) => { const v = T[lang][k] ?? T.en[k]; return typeof v === "function" ? v(...a) : v; };
function bnNum(v) { return String(v).replace(/[0-9]/g, (d) => BN_DIGITS[d]); }
const num = (v) => (lang === "bn" ? bnNum(v) : String(v));
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove("show"), 3200); }

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("langEn").setAttribute("aria-pressed", lang === "en"); $("langBn").setAttribute("aria-pressed", lang === "bn");
  $("viewPeople").setAttribute("aria-pressed", view === "people"); $("viewVehicles").setAttribute("aria-pressed", view === "vehicles");
  adviceSig = ""; if (state) render(state);
}

/* ---------- connection ---------- */
async function init() {
  const data = await (await fetch("/api/junctions")).json();
  overrideReasons = data.override_reasons || [];
  $("ovReason").innerHTML = overrideReasons.map((r) => `<option>${esc(r)}</option>`).join("");
  $("junction").innerHTML = data.junctions.map((j) => `<option value="${esc(j.id)}">${esc(j.name)}</option>`).join("");
  const start = data.junctions.some((j) => j.id === data.default) ? data.default : (data.junctions[0] || {}).id;
  if (start) { $("junction").value = start; openJunction(start); }
  applyI18n();
}
function openJunction(id) {
  junctionId = id; adviceId = null; adviceSig = ""; state = null;
  $("stream").src = `/api/stream/${encodeURIComponent(id)}`;
  if (es) es.close(); clearInterval(pollTimer);
  if ("EventSource" in window) {
    es = new EventSource(`/api/events/${encodeURIComponent(id)}`);
    es.onmessage = (e) => render(JSON.parse(e.data));
    es.onerror = () => { es.close(); startPolling(); };
  } else startPolling();
  loadLog();
}
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => { try { render(await (await fetch(`/api/state/${encodeURIComponent(junctionId)}`)).json()); } catch (_) {} }, 500);
}

/* ---------- render ---------- */
// "Road 2 · CDA Avenue", but just "Road 2" when the zone still has its default name.
function extraName(i, name) { return name && !/^road\s*\d+$/i.test(name.trim()) ? ` · ${name}` : ""; }
function roadLabel(i, name) { return `${esc(t("road"))} ${num(i)}${esc(extraName(i, name))}`; }

function render(s) {
  state = s;
  if (s.status === "error") { $("fps").textContent = s.error; return; }
  if (s.status !== "running") return;
  $("fps").textContent = `${s.fps} fps · ${s.total_vehicles} ${lang === "bn" ? "যানবাহন" : "vehicles"} · ${s.total_people_detected} ${lang === "bn" ? "মানুষ" : "people"}`;
  const types = s.supported_types || [];
  $("modelNote").textContent = `${t("modelDetects")}: ${types.filter((x) => x !== "person").join(", ")}` + (types.includes("cng") ? "" : ` · ${t("needFinetune")}`);
  applyFeatures(s.features);
  renderConfidence(s.confidence || {});
  renderRoads(s);
  renderEmergency(s);
  renderAdvice(s.advice, s);
  renderForecast(s.forecast);
  $("nextIn").textContent = s.next_advice_in_s != null ? t("nextIn", s.next_advice_in_s) : "";
  if (Date.now() - lastLogFetch > 10000) loadLog();
}

// Hide panels for features the server does not offer (older builds send a shorter list).
let featSig = null;
function applyFeatures(list) {
  const sig = list ? list.join(",") : "all";
  if (sig === featSig) return; featSig = sig;
  const has = (f) => !list || list.includes(f);
  $("confChip").hidden = !has("confidence");
  $("emBtn").hidden = !has("emergency");
  $("simPanel").hidden = !has("simulation");
  $("fcPanel").hidden = !has("forecast");
  document.querySelector(".bottom").style.setProperty("--cols", 1 + has("simulation") + has("forecast"));
}

function renderConfidence(c) {
  const chip = $("confChip"); const level = c.level || "High";
  chip.className = `chip conf-${level}`;
  const levelTxt = lang === "bn" ? { High: "বেশি", Medium: "মাঝারি", Low: "কম" }[level] : level;
  $("confText").textContent = `${t("confidence")}: ${levelTxt}` + (c.score != null ? ` · ${num(Math.round(c.score * 100))}%` : "");
  chip.title = (c.reasons || []).join(", ");
  const low = level === "Low" && !(state && state.emergency);
  $("lowConf").classList.toggle("show", low);
  $("lowConfReasons").textContent = (c.reasons || []).map((r) => (lang === "bn" ? REASON_BN[r] || r : r)).join(" · ");
}

function renderRoads(s) {
  const roads = s.roads || [];
  const key = view === "people" ? "people" : "total_vehicles";
  $("roadsTitle").textContent = view === "people" ? t("peopleTitle") : t("vehiclesTitle");
  $("rankNote").textContent = view === "people" ? t("rankedPeople") : t("rankedVehicles");
  if (!roads.length) { $("roads").innerHTML = `<p class="muted small">${esc(t("noZones"))}</p>`; $("ped").hidden = true; return; }
  const order = view === "people" ? s.rank_people : s.rank_vehicles;
  const byId = Object.fromEntries(roads.map((r, i) => [r.id, { ...r, index: i + 1 }]));
  const max = Math.max(1, ...roads.map((r) => r[key] || 0));
  $("roads").innerHTML = order.map((id, pos) => {
    const r = byId[id]; const v = r[key] || 0;
    const mix = Object.entries(r.vehicles || {}).map(([k, n]) => `<span>${esc(TYPE_LABEL[k] || k)} ${num(n)}</span>`).join("");
    const shown = view === "people" ? `~${num(Math.round(v))}` : num(v);
    return `<div class="road ${pos === 0 && v > 0 ? "top" : ""}">
      <div class="name"><span class="rank">${num(pos + 1)}</span>${roadLabel(r.index, r.name)}<span class="val">${shown}</span></div>
      <div class="bar"><i style="width:${(100 * v / max).toFixed(1)}%"></i></div>
      <div class="mix">${mix}<span>${esc(t("queued"))} ${num(r.queued)}</span><span>${esc(t("wait"))} ${num(Math.round(r.longest_wait_s))}s</span></div>
    </div>`;
  }).join("");
  const ext = s.advice && s.advice.walk_extension ? s.advice.walk_extension : 0;
  $("ped").hidden = !(s.crossings || []).length;
  $("ped").textContent = t("pedLine", s.pedestrians_waiting || 0, ext);
}

let emSig = "";
function renderEmergency(s) {
  const roads = s.roads || [];
  const sig = lang + "|" + roads.map((r) => r.id + r.name).join(",");
  if (sig !== emSig) { // rebuild the menu only when the roads change, so buttons stay clickable
    emSig = sig;
    $("emPop").innerHTML = `<p class="h">${esc(t("chooseRoad"))}</p>` + roads.map((r, i) =>
      `<button class="btn small" role="menuitem" data-road="${esc(r.id)}">${roadLabel(i + 1, r.name)}</button>`).join("");
    $("emPop").querySelectorAll("button[data-road]").forEach((b) => (b.onclick = () => startEmergency(b.dataset.road)));
  }
  const em = s.emergency;
  $("emBar").classList.toggle("show", !!em);
  if (em) { const idx = roads.findIndex((r) => r.id === em.road) + 1; $("emText").textContent = t("emBar", idx, em.remaining_s); }
}

function renderAdvice(a, s) {
  const card = $("adviceCard");
  if (!a) return;
  if (a.error) { $("what").textContent = a.error; return; }
  const sig = `${a.id}|${a.explanation && a.explanation.source}|${lang}`;
  if (sig === adviceSig) return; // only redraw when the advice or its text changes
  const isNew = a.id !== adviceId;
  adviceSig = sig; adviceId = a.id;
  card.classList.remove("mode-keep", "mode-emergency");
  const top = a.top;
  if (a.mode === "keep_fixed") {
    card.classList.add("mode-keep"); $("bigsec").textContent = t("fixedTimer"); $("what").textContent = t("keepFixed");
  } else if (a.mode === "emergency" && top) {
    card.classList.add("mode-emergency"); $("bigsec").textContent = `🚑 ${num(top.green)}s`; $("what").textContent = t("emFor", top.index);
  } else if (top) {
    countUp($("bigsec"), top.delta, isNew); $("what").textContent = t("greenFor", top.index, top.name);
  } else { $("bigsec").textContent = "✓"; $("what").textContent = t("keepPlan"); }

  const ex = a.explanation || {};
  $("explainText").innerHTML = `<div class="bn" lang="bn">${esc(ex.bn)}</div>` + (lang === "en" ? `<div class="small muted" style="margin-top:4px;font-family:Inter">${esc(ex.en)}</div>` : "");
  $("explainSrc").textContent = (T[lang].src || T.en.src)[ex.source] || "";

  const plan = a.plan || [];
  $("whyBody").innerHTML = plan.length ? `<table><tr><th>${esc(t("road"))}</th><th>${esc(t("peopleCol"))}</th><th>${esc(t("vehiclesCol"))}</th><th>${esc(t("fixedCol"))}</th><th>${esc(t("green"))}</th><th>${esc(t("change"))}</th></tr>` +
    plan.map((r) => `<tr><td>${num(r.index)} · ${esc(r.name)}</td><td>${num(Math.round(r.people))}</td><td>${num(r.vehicles)}</td><td>${num(r.fixed)}s</td><td>${num(r.green)}s</td><td>${r.delta > 0 ? "+" : ""}${num(r.delta)}s</td></tr>`).join("") +
    `</table><p class="muted small">${esc((a.reasons || []).join(" · "))}</p><p class="muted small">Walk: ${num(a.walk_seconds)}s · Cycle: ${num((a.numbers || {}).cycle || "")}s</p>` : "";

  const actionable = a.mode === "advise" || a.mode === "emergency";
  $("acceptBtn").disabled = !actionable; $("overrideBtn").disabled = !actionable;
  if (isNew) {
    $("decided").textContent = ""; $("overrideForm").classList.remove("show");
    $("ovSeconds").value = top ? top.delta : 0;
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    renderSimulation(a.simulation); loadLog();
  }
}

function countUp(el, target, animate) {
  const sign = target > 0 ? "+" : "";
  if (!animate) { el.textContent = `${sign}${num(target)}s`; return; }
  const start = performance.now(), dur = 700;
  const step = (now) => { const p = Math.min(1, (now - start) / dur); el.textContent = `${sign}${num(Math.round(target * (1 - Math.pow(1 - p, 3))))}s`; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function renderSimulation(sim) {
  if (!sim) { $("cmp").innerHTML = `<span class="muted small">${esc(t("simWait"))}</span>`; $("simDelta").textContent = ""; $("previewChart").innerHTML = ""; return; }
  const rows = [["personWait", "avg_person_wait_s", "s"], ["vehWait", "avg_wait_s", "s"], ["peopleMin", "people_moved_per_min", ""]];
  $("cmp").innerHTML = rows.map(([label, k, unit]) => {
    const f = sim.fixed[k], r = sim.roadmind[k], m = Math.max(f, r, 1);
    return `<span class="muted">${esc(t(label))}</span><span></span><span></span>
      <span class="small">${esc(t("fixed"))}</span><span class="b f"><i style="width:${(100 * f / m).toFixed(1)}%"></i></span><b>${num(f)}${unit}</b>
      <span class="small">${esc(t("roadmind"))}</span><span class="b r"><i style="width:${(100 * r / m).toFixed(1)}%"></i></span><b class="grad-text">${num(r)}${unit}</b>`;
  }).join("");
  $("simDelta").textContent = t("deltaTxt", sim.person_wait_change_pct);
  const p = sim.preview, all = [...p.fixed, ...p.roadmind], maxV = Math.max(1, ...all);
  const line = (arr) => arr.map((v, i) => `${(i / (arr.length - 1 || 1)) * 300},${100 - (v / maxV) * 90}`).join(" ");
  $("previewChart").innerHTML = `<defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stop-color="#34D399"/><stop offset=".5" stop-color="#38BDF8"/><stop offset="1" stop-color="#A855F7"/></linearGradient></defs>
    <polyline points="${line(p.fixed)}" fill="none" stroke="#64748B" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <polyline points="${line(p.roadmind)}" fill="none" stroke="url(#pg)" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
}

function renderForecast(fc) {
  if (!fc) { $("fcNote").textContent = lang === "bn" ? "প্রথম পূর্বাভাস এক মিনিটের মধ্যে আসবে…" : "First forecast arrives within a minute…"; return; }
  $("fcNow").textContent = fc.now;
  const pts = fc.points || []; if (!pts.length) return;
  const maxV = Math.max(1, ...pts.map((p) => p.high));
  const x = (i) => (i / (pts.length - 1)) * 300, y = (v) => 100 - (v / maxV) * 88;
  const band = pts.map((p, i) => `${x(i)},${y(p.high)}`).join(" ") + " " + pts.slice().reverse().map((p, i) => `${x(pts.length - 1 - i)},${y(p.low)}`).join(" ");
  const markers = pts.map((p, i) => p.events.length ? `<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="110" stroke="#FDE68A" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>` : "").join("");
  $("fcChart").innerHTML = `<polygon points="${band}" fill="rgba(168,85,247,.22)"/>${markers}
    <polyline points="${pts.map((p, i) => `${x(i)},${y(p.people)}`).join(" ")}" fill="none" stroke="#C4B5FD" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
  const b = fc.banner;
  $("fcBanner").innerHTML = b ? `<div class="banner">${esc(t("rush", b.minutes, lang === "bn" ? b.event_bn : b.event))}</div>` : "";
  $("fcNote").textContent = (lang === "bn" ? "রেকর্ড করা গণনা ও স্থানীয় ঘটনার ক্যালেন্ডার থেকে পূর্বাভাস; গুণকগুলো অনুমান।" : fc.note) + ` (${fc.history_points} pts)`;
}

/* ---------- log ---------- */
async function loadLog() {
  if (!junctionId) return; lastLogFetch = Date.now();
  try {
    const data = await (await fetch(`/api/log/${encodeURIComponent(junctionId)}`)).json();
    $("log").innerHTML = data.decisions.map((d) => {
      const time = new Date(d.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const top = d.advice.top; const label = d.status === "emergency" ? t("emergencyS") : t(d.status) || d.status;
      const what = d.advice.mode === "keep_fixed" ? t("keepFixed") : top ? `${t("road")} ${num(top.index)} ${top.delta > 0 ? "+" : ""}${num(d.advice.mode === "emergency" ? top.green : top.delta)}s` : t("keepPlan");
      const extra = d.status === "overridden" ? ` → ${d.chosen_seconds > 0 ? "+" : ""}${num(d.chosen_seconds)}s (${esc(d.reason)})` : "";
      return `<li><button data-id="${d.id}"><span class="st st-${esc(d.status)}">${esc(label)}</span><span>${esc(time)} · ${esc(what)}${extra}</span></button></li>`;
    }).join("") || `<li class="muted small">—</li>`;
    $("log").querySelectorAll("button[data-id]").forEach((b) => (b.onclick = () => showLog(data.decisions.find((d) => String(d.id) === b.dataset.id))));
  } catch (_) {}
}
function showLog(d) {
  if (!d) return;
  const ex = d.explanation || {};
  $("logBody").innerHTML = (d.thumb ? `<img class="thumb" src="/api/thumb/${encodeURIComponent(d.thumb)}" alt="Small blurred snapshot of the junction at that moment">` : "") +
    `<p class="bn">${esc(ex.bn)}</p><p class="muted small">${esc(ex.en)}</p>` +
    `<p class="small"><span class="st st-${esc(d.status)}">${esc(t(d.status) || d.status)}</span> ${d.reason ? esc(d.reason) : ""}</p>` +
    `<table class="small" style="width:100%">${(d.advice.plan || []).map((r) => `<tr><td>${num(r.index)} · ${esc(r.name)}</td><td>~${num(Math.round(r.people))} ${esc(t("peopleCol"))}</td><td>${num(r.fixed)}s → ${num(r.green)}s</td></tr>`).join("")}</table>`;
  $("logDialog").showModal();
}

/* ---------- actions ---------- */
async function decide(action, seconds, reason) {
  if (!adviceId) return;
  const res = await fetch("/api/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: adviceId, action, seconds, reason }) });
  const data = await res.json();
  if (!res.ok) { toast(data.detail || "Error"); return; }
  $("decided").textContent = t("savedDecision", action === "accept" ? t("accepted") : t("overridden"));
  $("overrideForm").classList.remove("show"); loadLog();
}
async function startEmergency(roadId) {
  closePop();
  await fetch(`/api/emergency/${encodeURIComponent(junctionId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ road_id: roadId }) });
}
function closePop() { $("emPop").classList.remove("show"); $("emBtn").setAttribute("aria-expanded", "false"); }

function speak() {
  const text = state && state.advice && state.advice.explanation ? state.advice.explanation.bn : "";
  if (!text || !("speechSynthesis" in window)) { toast(t("noVoice")); return; }
  const voices = speechSynthesis.getVoices(); const voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("bn"));
  if (!voice) { toast(t("noVoice")); return; }
  const u = new SpeechSynthesisUtterance(text); u.voice = voice; u.lang = voice.lang; u.rate = 0.95;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

function openOccupancy() {
  const occ = (state && state.occupancy) || {};
  $("occGrid").innerHTML = Object.entries(occ).map(([k, v]) =>
    `<label for="occ_${esc(k)}">${esc(TYPE_LABEL[k] || k)}</label><input id="occ_${esc(k)}" data-type="${esc(k)}" type="number" min="0" max="200" step="0.1" value="${esc(v)}">`).join("");
  $("occDialog").showModal();
}

/* ---------- wiring ---------- */
$("junction").onchange = () => openJunction($("junction").value);
$("viewPeople").onclick = () => { view = "people"; applyI18n(); };
$("viewVehicles").onclick = () => { view = "vehicles"; applyI18n(); };
$("langEn").onclick = () => { lang = "en"; applyI18n(); };
$("langBn").onclick = () => { lang = "bn"; applyI18n(); };
$("acceptBtn").onclick = () => decide("accept", state && state.advice && state.advice.top ? state.advice.top.delta : null, null);
$("overrideBtn").onclick = () => $("overrideForm").classList.toggle("show");
$("overrideForm").onsubmit = (e) => { e.preventDefault(); decide("override", parseInt($("ovSeconds").value, 10), $("ovReason").value); };
$("refreshBtn").onclick = () => fetch(`/api/advice/${encodeURIComponent(junctionId)}/refresh`, { method: "POST" });
$("speakBtn").onclick = speak;
$("emBtn").onclick = (e) => { e.stopPropagation(); const show = !$("emPop").classList.contains("show"); $("emPop").classList.toggle("show", show); $("emBtn").setAttribute("aria-expanded", String(show)); };
document.addEventListener("click", (e) => { if (!$("emPop").contains(e.target)) closePop(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });
$("emCancel").onclick = () => fetch(`/api/emergency/${encodeURIComponent(junctionId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cancel: true }) });
$("occBtn").onclick = openOccupancy;
$("occClose").onclick = () => $("occDialog").close();
$("logClose").onclick = () => $("logDialog").close();
$("occForm").onsubmit = async (e) => {
  e.preventDefault();
  const occupancy = {}; $("occGrid").querySelectorAll("input").forEach((i) => (occupancy[i.dataset.type] = parseFloat(i.value)));
  const res = await fetch(`/api/junctions/${encodeURIComponent(junctionId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occupancy }) });
  if (res.ok) { $("occDialog").close(); toast(lang === "bn" ? "সংরক্ষিত ✓" : "Saved ✓"); } else toast((await res.json()).detail);
};
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};
init();
