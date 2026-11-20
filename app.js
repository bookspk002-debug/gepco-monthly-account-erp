"use strict";
/* GEPCO Monthly Account ERP — web version
   Database: IndexedDB (browser ke andar). Data isi computer/browser mein rehta hai.
   Backup ke liye Backup page se JSON export karein. */

// ---------- IndexedDB (simple key-value) ----------
const DB_NAME = "gepco-erp-db";
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readonly").objectStore("kv").get(key);
    tx.onsuccess = () => res(tx.result);
    tx.onerror = () => rej(tx.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite").objectStore("kv").put(val, key);
    tx.onsuccess = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ---------- State ----------
let S = null; // poora database state
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function num(v) { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n; }
function fmt(n) {
  n = num(n);
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 4200);
}
function monthLabel(m) {
  const [y, mo] = m.split("-").map(Number);
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return names[mo - 1] + " " + y;
}
function nextMonth(m) {
  let [y, mo] = m.split("-").map(Number);
  mo++; if (mo > 12) { mo = 1; y++; }
  return y + "-" + String(mo).padStart(2, "0");
}

function emptyMonth(opening) {
  return {
    status: "open",
    opening: opening || {},
    postings: [],
    jvs: [],
    advices: [],
    cheques: [],
    cp41: { sale: [], other: [], taxes: [], rev: { collections: 0, bankActual: 0, consumerCr: 0, collExp: 0 } },
    payroll: { dr: [], cr: [] },
    cp91: { detail: (typeof SEED !== "undefined" ? SEED.cp91Detail.map((co) => ({ code: co.code, iot: co.iot, desc: co.desc, offices: co.offices.map((o) => ({ fs: o.fs, name: o.name, no: 0, amount: 0 })) })) : []), extra520603: 0, extra1501016: 0 },
    ca: { openA: 0, openB: 0, openC: 0, openD: 0, advRecvDr: 0, advRecvCr: 0, fundsRecv: 0, remitRev: 0, remitSec: 0, remitMisc: 0 }
  };
}

function seedState() {
  const m = emptyMonth(JSON.parse(JSON.stringify(SEED.opening)));
  m.postings = SEED.postings.map((p) => ({ id: uid(), folio: p.folio, source: p.source, code: p.code, dr: p.dr, cr: p.cr, batch: "July 2026 summaries (purani file)" }));
  m.jvs = [{
    id: uid(), date: "2026-07-31",
    narration: "July 2026 adjustments — purani file ke formulas mein chhupay hue amounts (har line confirm karein)",
    lines: SEED.jvAdjustments.map((l) => ({ code: l.code, dr: l.dr, cr: l.cr })),
    posted: true, seed: true
  }];
  m.advices = [
    ...SEED.drAdvices.map((a) => ({ id: uid(), type: "DR", to: a.to, no: a.no, date: a.date, amount: a.amount, narration: a.narration || "" })),
    ...SEED.crAdvices.map((a) => ({ id: uid(), type: "CR", to: a.to, no: a.no, date: a.date, amount: a.amount, narration: a.narration || "" }))
  ];
  m.cheques = SEED.ssCheques.map((c) => ({ id: uid(), office: c.office, cheque: c.cheque, date: c.date, amount: c.amount }));
  m.cp41 = { sale: JSON.parse(JSON.stringify(SEED.cp41Sale)), other: JSON.parse(JSON.stringify(SEED.cp41Other)), taxes: JSON.parse(JSON.stringify(SEED.cp41Taxes)), rev: { ...SEED.cp41Rev } };
  m.payroll = { dr: JSON.parse(JSON.stringify(SEED.payrollDr)), cr: JSON.parse(JSON.stringify(SEED.payrollCr)) };
  m.cp91 = { detail: JSON.parse(JSON.stringify(SEED.cp91Detail)), extra520603: 49004, extra1501016: 72046 };
  m.ca = { openA: SEED.caOpening.A, openB: SEED.caOpening.B, openC: SEED.caOpening.C, openD: SEED.caOpening.D, advRecvDr: 21289541, advRecvCr: 1214631786.92, fundsRecv: 69615, remitRev: 1176053625, remitSec: 1266136, remitMisc: 0 };
  return {
    unit: SEED.unit, unitCode: SEED.unitCode, currentMonth: SEED.month,
    coa: SEED.coa.map((c) => ({ code: c.code, desc: c.desc, bs: c.bs })),
    months: { [SEED.month]: m }
  };
}

async function save() { await idbSet("state", S); }
async function load() {
  const saved = await idbGet("state");
  S = saved && saved.coa ? saved : seedState();
  // migration: purane saved data mein cp91.detail na ho to seed se layein
  Object.entries(S.months).forEach(([mk, mm]) => {
    if (mm.cp91 && !mm.cp91.detail) {
      const isJuly = mk === SEED.month;
      mm.cp91 = { detail: JSON.parse(JSON.stringify(SEED.cp91Detail)).map((co) => ({ ...co, offices: co.offices.map((o) => ({ ...o, amount: isJuly ? o.amount : 0, no: isJuly ? o.no : 0 })) })), extra520603: mm.cp91.extra520603 || 0, extra1501016: mm.cp91.extra1501016 || 0 };
    }
    if (!mm.ca) mm.ca = emptyMonth({}).ca;
  });
  await save();
}

function M() { return S.months[S.currentMonth]; }
function coaMap() { const map = {}; S.coa.forEach((c) => (map[c.code] = c)); return map; }

// ---------- Trial calculation ----------
function computeTrial(monthKey) {
  const m = S.months[monthKey];
  const rows = {};
  S.coa.forEach((c) => {
    const op = m.opening[c.code] || { dr: 0, cr: 0 };
    rows[c.code] = { code: c.code, desc: c.desc, bs: c.bs, openDr: num(op.dr), openCr: num(op.cr), postDr: 0, postCr: 0, jvDr: 0, jvCr: 0 };
  });
  const unmatched = {};
  m.postings.forEach((p) => {
    if (rows[p.code]) { rows[p.code].postDr += num(p.dr); rows[p.code].postCr += num(p.cr); }
    else { unmatched[p.code] = unmatched[p.code] || { dr: 0, cr: 0, count: 0 }; unmatched[p.code].dr += num(p.dr); unmatched[p.code].cr += num(p.cr); unmatched[p.code].count++; }
  });
  m.jvs.filter((j) => j.posted).forEach((j) => j.lines.forEach((l) => {
    if (rows[l.code]) { rows[l.code].jvDr += num(l.dr); rows[l.code].jvCr += num(l.cr); }
    else { unmatched[l.code] = unmatched[l.code] || { dr: 0, cr: 0, count: 0 }; unmatched[l.code].dr += num(l.dr); unmatched[l.code].cr += num(l.cr); unmatched[l.code].count++; }
  }));
  const list = Object.values(rows).map((r) => ({
    ...r,
    duringDr: r.postDr + r.jvDr, duringCr: r.postCr + r.jvCr,
    closeDr: r.openDr + r.postDr + r.jvDr, closeCr: r.openCr + r.postCr + r.jvCr
  }));
  const tot = { openDr: 0, openCr: 0, duringDr: 0, duringCr: 0, closeDr: 0, closeCr: 0, postDr: 0, postCr: 0 };
  list.forEach((r) => { tot.openDr += r.openDr; tot.openCr += r.openCr; tot.duringDr += r.duringDr; tot.duringCr += r.duringCr; tot.closeDr += r.closeDr; tot.closeCr += r.closeCr; tot.postDr += r.postDr; tot.postCr += r.postCr; });
  const postTot = m.postings.reduce((a, p) => ({ dr: a.dr + num(p.dr), cr: a.cr + num(p.cr) }), { dr: 0, cr: 0 });
  return { rows: list, tot, unmatched, postTot, diff: tot.closeDr - tot.closeCr };
}

// ---------- Print helper ----------
function printDoc(title, bodyHtml) {
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:24px}
    .head{text-align:center;border-bottom:2px solid #0F3B2E;padding-bottom:8px;margin-bottom:12px}
    .head h1{font-size:16px;margin:0;letter-spacing:.5px}
    .head h2{font-size:13px;margin:3px 0 0;font-weight:600}
    .head .sub{font-size:11px;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#0F3B2E;color:#fff;padding:5px;text-align:left}
    td{padding:4px 5px;border-bottom:1px solid #ccc}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    tr.total td{font-weight:bold;background:#eaf2ee;border-top:2px solid #0F3B2E}
    .sign{margin-top:42px;display:flex;justify-content:space-between}
    .sign div{text-align:center;font-size:11px}
    .line{border-top:1px solid #000;padding-top:4px;min-width:200px}
    @media print{body{margin:10px}}
  </style></head><body>
  <div class="head"><h1>GUJRANWALA ELECTRIC POWER COMPANY LIMITED</h1>
  <h2>${esc(title)}</h2>
  <div class="sub">${esc(S.unit)} (Code: ${esc(S.unitCode)}) &nbsp;|&nbsp; Month: ${esc(monthLabel(S.currentMonth))}</div></div>
  ${bodyHtml}
  <div class="sign"><div><div class="line">Prepared by</div></div><div><div class="line">Checked by</div></div>
  <div><div class="line">Divisional Accounts Officer<br>o/o AM (CS) GEPCO Hafizabad</div></div></div>
  <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

// ---------- Navigation ----------
let currentView = "dashboard";
function render() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
  const sel = document.getElementById("monthSelect");
  sel.innerHTML = Object.keys(S.months).sort().map((m) => `<option value="${m}" ${m === S.currentMonth ? "selected" : ""}>${monthLabel(m)}</option>`).join("");
  document.getElementById("unitName").textContent = S.unit;
  document.getElementById("unitCode").textContent = S.unitCode;
  document.getElementById("monthStatus").textContent = M().status === "closed" ? "Status: CLOSED (locked)" : "Status: Open";
  const views = { dashboard: vDashboard, coa: vCOA, opening: vOpening, cp41: vCP41, payroll: vPayroll, cp91: vCP91, summaries: vSummaries, jv: vJV, trial: vTrial, advices: vAdvices, cheques: vCheques, current: vCurrent, close: vClose, checks: vChecks, backup: vBackup };
  document.getElementById("view").innerHTML = views[currentView]();
  const bind = { dashboard: bDashboard, coa: bCOA, opening: bOpening, cp41: bCP41, payroll: bPayroll, cp91: bCP91, summaries: bSummaries, jv: bJV, trial: bTrial, advices: bAdvices, cheques: bCheques, current: bCurrent, close: bClose, checks: bChecks, backup: bBackup };
  if (bind[currentView]) bind[currentView]();
}
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => { currentView = b.dataset.view; render(); }));
document.getElementById("monthSelect").addEventListener("change", async (e) => { S.currentMonth = e.target.value; await save(); render(); });
function locked() { return M().status === "closed"; }
function lockNote() { return locked() ? `<div class="card" style="border-color:var(--amber)"><b>Ye month CLOSED hai</b> — changes nahi ho sakti. Naya month Month / Year Close se banayein.</div>` : ""; }

// ---------- Dashboard ----------
function vDashboard() {
  const t = computeTrial(S.currentMonth);
  const m = M();
  const drAdv = m.advices.filter((a) => a.type === "DR").reduce((s, a) => s + num(a.amount), 0);
  const crAdv = m.advices.filter((a) => a.type === "CR").reduce((s, a) => s + num(a.amount), 0);
  return `<h1>Dashboard — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">${esc(S.unit)} (${esc(S.unitCode)}) &nbsp;|&nbsp; Flow: CP-41 + Payroll + CP-91 + Advices → Summaries → Trial → Final Trial</div>
  ${lockNote()}
  <div class="grid">
    <div class="stat"><div class="label">Trial Closing Dr</div><div class="value">${fmt(t.tot.closeDr)}</div></div>
    <div class="stat"><div class="label">Trial Closing Cr</div><div class="value">${fmt(t.tot.closeCr)}</div></div>
    <div class="stat"><div class="label">Difference (Dr − Cr)</div><div class="value ${Math.abs(t.diff) > 0.5 ? "red" : ""}">${fmt(t.diff)}</div></div>
    <div class="stat"><div class="label">Summaries Postings</div><div class="value">${m.postings.length} lines</div></div>
    <div class="stat"><div class="label">Journal Vouchers (posted)</div><div class="value">${m.jvs.filter((j) => j.posted).length}</div></div>
    <div class="stat"><div class="label">Dr Advices Issued</div><div class="value">${fmt(drAdv)}</div></div>
    <div class="stat"><div class="label">Cr Advices Issued</div><div class="value">${fmt(crAdv)}</div></div>
    <div class="stat"><div class="label">Unmatched GL Codes</div><div class="value ${Object.keys(t.unmatched).length ? "red" : ""}">${Object.keys(t.unmatched).length}</div></div>
  </div>
  <div class="card"><h2 style="margin-top:0">Is month ka kaam — tartib</h2>
  <div class="kv">
    <b>1. CP-41 Entry</b><span>Sale + Taxes ki detail likhein, Folio 3/4 auto</span>
    <b>2. Payroll Entry</b><span>Pay + deductions, Folio 1 auto</span>
    <b>3. CP-91 Entry</b><span>Free supply company-wise</span>
    <b>4. Summaries</b><span>Modules se generate karein ya Excel/CSV upload karein</span>
    <b>5. Journal Vouchers</b><span>Adjustments ek ek JV post karke (wajah ke saath)</span>
    <b>6. Trial Balance</b><span>Auto — print bhi ho sakti hai</span>
    <b>7. Advices + Current Account</b><span>Dr/Cr advices banayein, print karein</span>
    <b>8. Month Close</b><span>Closing agle month ka Opening; June ke baad Year-End (BS carry, Operating zero)</span>
  </div></div>`;
}
function bDashboard() {}

// ---------- COA ----------
function vCOA() {
  const rows = S.coa.map((c, i) => `<tr>
    <td>${i + 1}</td><td><b>${esc(c.code)}</b></td><td>${esc(c.desc)}</td>
    <td><span class="badge ${c.bs ? "bs" : "op"}">${c.bs ? "Balance Sheet" : "Operating"}</span></td>
    <td>${c.bs ? "Carry Forward" : "Zero (year-end)"}</td>
    <td><button class="btn small ghost" data-del-coa="${esc(c.code)}">Delete</button></td></tr>`).join("");
  return `<h1>Chart of Accounts</h1><div class="sub">${S.coa.length} GL codes. 0–3 se shuru = Balance Sheet (carry forward), 4–9 = Operating (saal ke end par zero).</div>
  ${lockNote()}
  <div class="card"><div class="row">
    <input id="newCode" placeholder="GL Code (maslan 150101-6)" style="width:170px">
    <input id="newDesc" placeholder="Description" style="width:300px">
    <button class="btn" id="addCoa">Add Code</button>
    <button class="btn ghost" id="printCoa">Print COA</button>
  </div></div>
  <div class="table-wrap"><table><tr><th>Sr</th><th>GL Code</th><th>Description</th><th>Type</th><th>Year-End</th><th></th></tr>${rows}</table></div>`;
}
function bCOA() {
  document.getElementById("addCoa").onclick = async () => {
    const code = document.getElementById("newCode").value.trim();
    const desc = document.getElementById("newDesc").value.trim();
    if (!code) return toast("GL Code likhein");
    if (S.coa.some((c) => c.code === code)) return toast("Ye code pehle se hai");
    S.coa.push({ code, desc, bs: "0123".includes(code[0]) });
    await save(); toast("Code add ho gaya: " + code); render();
  };
  document.querySelectorAll("[data-del-coa]").forEach((b) => b.onclick = async () => {
    const code = b.dataset.delCoa;
    if (!confirm("Code " + code + " delete karein? Is code ki postings trial se bahar ho jayengi.")) return;
    S.coa = S.coa.filter((c) => c.code !== code);
    await save(); render();
  });
  document.getElementById("printCoa").onclick = () => {
    const rows = S.coa.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.code)}</td><td>${esc(c.desc)}</td><td>${c.bs ? "Balance Sheet" : "Operating"}</td></tr>`).join("");
    printDoc("Chart of Accounts", `<table><tr><th>Sr</th><th>GL Code</th><th>Description</th><th>Type</th></tr>${rows}</table>`);
  };
}


// ---------- File reading helper (CSV / Excel) ----------
async function readFileRows(file, sheetName) {
  if (/\.csv$|\.txt$/i.test(file.name)) {
    const text = await file.text();
    return text.split(/\r?\n/).map((l) => l.split(/[,\t;]/));
  }
  if (!window.XLSX) throw new Error("Excel parhne ke liye internet chahiye — CSV use karein");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const name = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
}
async function readWorkbookSheets(file) {
  if (!window.XLSX) throw new Error("Excel parhne ke liye internet chahiye — CSV use karein");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const out = {};
  wb.SheetNames.forEach((n) => (out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })));
  return out;
}

// ---------- Opening Balances ----------
let openingPreview = null;
function vOpening() {
  const m = M();
  let td = 0, tc = 0;
  const rows = S.coa.map((c, i) => {
    const op = m.opening[c.code] || { dr: 0, cr: 0 };
    td += num(op.dr); tc += num(op.cr);
    return `<tr><td>${i + 1}</td><td><b>${esc(c.code)}</b></td><td>${esc(c.desc)}</td>
    <td><input class="num-in op-dr" data-code="${esc(c.code)}" value="${op.dr}"></td>
    <td><input class="num-in op-cr" data-code="${esc(c.code)}" value="${op.cr}"></td></tr>`;
  }).join("");
  const prev = openingPreview ? `<div class="card"><h2 style="margin-top:0">Import Preview — ${openingPreview.length} codes</h2>
    <p class="muted">Import karne se in codes ke Opening balances replace ho jayenge (baqi codes waisay hi rahenge).</p>
    <div class="table-wrap"><table><tr><th>GL Code</th><th class="num">Dr</th><th class="num">Cr</th><th>COA mein hai?</th></tr>
    ${openingPreview.slice(0, 40).map((r) => `<tr><td>${esc(r.code)}</td><td class="num">${fmt(r.dr)}</td><td class="num">${fmt(r.cr)}</td><td>${coaMap()[r.code] ? '<span class="badge ok">Haan</span>' : '<span class="badge bad">Nahi — skip hoga</span>'}</td></tr>`).join("")}</table></div>
    <div class="row"><button class="btn gold" id="opImportBtn">Opening Balances Import karein</button><button class="btn ghost" id="opCancelPrev">Cancel</button></div></div>` : "";
  return `<h1>Opening Balances — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Previous month ke Closing balances. Total Dr ${fmt(td)} | Total Cr ${fmt(tc)} | Difference ${fmt(td - tc)}</div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">Previous Balances Upload / Import karein</h2>
  <p class="muted">Excel/CSV file mein columns hon: <b>GL Code, Dr, Cr</b> (header ho ya na ho). Ya box mein paste karein.</p>
  <div class="row"><input type="file" id="opFile" accept=".csv,.xlsx,.xls,.txt">
  <button class="btn ghost" id="opCsv">Opening Balances CSV Download (Export)</button>
  <button class="btn ghost" id="opPrint">Print Opening Balances</button></div>
  <textarea id="opPaste" placeholder="Paste karein — har line: GL Code, Dr, Cr"></textarea>
  <div class="row"><button class="btn" id="opParsePaste">Paste ko parhein</button></div></div>
  ${prev}
  <div class="table-wrap"><table><tr><th>Sr</th><th>GL Code</th><th>Description</th><th class="num">Opening Dr</th><th class="num">Opening Cr</th></tr>${rows}
  <tr class="total"><td colspan="3">TOTAL</td><td class="num">${fmt(td)}</td><td class="num">${fmt(tc)}</td></tr></table></div>`;
}
function parseOpeningRows(rows) {
  const out = [];
  rows.forEach((r) => {
    const cells = r.map((x) => String(x ?? "").trim());
    if (cells.length < 3) return;
    if (/code/i.test(cells[0]) && /dr/i.test(cells.join(" "))) return;
    // formats: Code,Dr,Cr  OR  Sr,Code,Desc,Dr,Cr  OR  Code,Desc,Dr,Cr
    let code, dr, cr;
    if (cells.length >= 5) { code = cells[1]; dr = cells[3]; cr = cells[4]; }
    else if (cells.length === 4) { code = cells[0]; dr = cells[2]; cr = cells[3]; }
    else { [code, dr, cr] = cells; }
    if (!code || !/^[0-9]/.test(code)) return;
    out.push({ code, dr: num(dr), cr: num(cr) });
  });
  return out;
}
function bOpening() {
  document.querySelectorAll(".op-dr").forEach((el) => el.onchange = async () => { const c = el.dataset.code; M().opening[c] = M().opening[c] || { dr: 0, cr: 0 }; M().opening[c].dr = num(el.value); await save(); });
  document.querySelectorAll(".op-cr").forEach((el) => el.onchange = async () => { const c = el.dataset.code; M().opening[c] = M().opening[c] || { dr: 0, cr: 0 }; M().opening[c].cr = num(el.value); await save(); });
  document.getElementById("opFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { openingPreview = parseOpeningRows(await readFileRows(f)); toast(openingPreview.length + " codes mile — preview dekhein"); render(); }
    catch (err) { toast("Upload fail: " + err.message); }
  };
  document.getElementById("opParsePaste").onclick = () => {
    openingPreview = parseOpeningRows(document.getElementById("opPaste").value.split(/\r?\n/).map((l) => l.split(/[,\t;]/)));
    toast(openingPreview.length + " codes mile — preview dekhein"); render();
  };
  const imp = document.getElementById("opImportBtn");
  if (imp) imp.onclick = async () => {
    let n = 0;
    openingPreview.forEach((r) => { if (coaMap()[r.code]) { M().opening[r.code] = { dr: r.dr, cr: r.cr }; n++; } });
    openingPreview = null; await save(); toast(n + " codes ke Opening balances import ho gaye"); render();
  };
  const cp = document.getElementById("opCancelPrev");
  if (cp) cp.onclick = () => { openingPreview = null; render(); };
  document.getElementById("opCsv").onclick = () => downloadCSV("opening-balances-" + S.currentMonth + ".csv", [["GL Code", "Description", "Dr", "Cr"], ...S.coa.map((c) => [c.code, c.desc, (M().opening[c.code] || {}).dr || 0, (M().opening[c.code] || {}).cr || 0])]);
  document.getElementById("opPrint").onclick = () => {
    const rows = S.coa.map((c, i) => { const op = M().opening[c.code] || { dr: 0, cr: 0 }; return `<tr><td>${i + 1}</td><td>${esc(c.code)}</td><td>${esc(c.desc)}</td><td class="num">${fmt(op.dr)}</td><td class="num">${fmt(op.cr)}</td></tr>`; }).join("");
    printDoc("Opening Balances", `<table><tr><th>Sr</th><th>GL Code</th><th>Description</th><th class="num">Dr</th><th class="num">Cr</th></tr>${rows}</table>`);
  };
}

// ---------- CP-41 ----------
function cp41Totals() {
  const c = M().cp41;
  const saleTot = c.sale.reduce((s, r) => s + num(r.var) + num(r.fix) + num(r.lpf) + num(r.aqta), 0);
  const othTot = c.other.reduce((s, r) => s + num(r.amount), 0);
  return { saleTot, othTot, consumerDr: saleTot + othTot };
}
function vCP41() {
  const c = M().cp41; const t = cp41Totals();
  const saleRows = c.sale.map((r, i) => `<tr><td>${esc(r.cat)}</td><td>${esc(r.code)}</td>
    ${["var", "fix", "lpf", "aqta"].map((k) => `<td><input class="num-in cp41-sale" data-i="${i}" data-k="${k}" value="${r[k]}"></td>`).join("")}
    <td class="num"><b>${fmt(num(r.var) + num(r.fix) + num(r.lpf) + num(r.aqta))}</b></td></tr>`).join("");
  const othRows = c.other.map((r, i) => `<tr><td>${esc(r.item)}</td><td>${esc(r.code)}</td>
    <td><input class="num-in cp41-oth" data-i="${i}" value="${r.amount}"></td></tr>`).join("");
  const taxRows = c.taxes.map((r, i) => `<tr><td>${esc(r.name)}</td><td>${esc(r.rec)}</td><td>${esc(r.pay || "—")}</td><td>${esc(r.col)}</td>
    ${["ob", "ass", "pmt", "comm"].map((k) => `<td><input class="num-in cp41-tax" data-i="${i}" data-k="${k}" value="${r[k]}"></td>`).join("")}
    <td class="num"><b>${fmt(num(r.ob) + num(r.ass) - num(r.pmt))}</b></td></tr>`).join("");
  return `<h1>CP-41 Entry — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">CP-41 ki detail likhein. "Generate Summaries" dabane se Folio 3 (Revenue) aur Folio 4 (Taxes) ki posting lines ban jayengi.</div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">A) Sale — Category wise</h2>
  <div class="table-wrap"><table><tr><th>Category</th><th>GL (Cr)</th><th class="num">Variable</th><th class="num">Fix Charges</th><th class="num">L.P.F</th><th class="num">AQTA</th><th class="num">TOTAL</th></tr>
  ${saleRows}<tr class="total"><td colspan="6">TOTAL SALE</td><td class="num">${fmt(t.saleTot)}</td></tr></table></div>
  <h2>Other Revenue</h2>
  <table><tr><th>Item</th><th>GL (Cr)</th><th class="num">Amount</th></tr>${othRows}
  <tr class="total"><td colspan="2">TOTAL OTHER</td><td class="num">${fmt(t.othTot)}</td></tr>
  <tr class="total"><td colspan="2">Dr Consumer (100102)</td><td class="num">${fmt(t.consumerDr)}</td></tr></table></div>
  <div class="card"><h2 style="margin-top:0">B) Taxes — OB, Assessment, Payments, CB</h2>
  <div class="table-wrap"><table><tr><th>Tax</th><th>Receivable</th><th>Payable</th><th>Collection</th><th class="num">OB</th><th class="num">Assessment</th><th class="num">Payments</th><th class="num">Commission</th><th class="num">CB</th></tr>
  ${taxRows}</table></div>
  <h2>C) Revenue Collections</h2>
  <div class="kv">
    <b>Revenue Collections (170301 Dr)</b><span><input class="num-in cp41-rev" data-k="collections" value="${c.rev.collections}"></span>
    <b>Bank Actual (170301 Cr / 150200 Dr)</b><span><input class="num-in cp41-rev" data-k="bankActual" value="${c.rev.bankActual}"></span>
    <b>Collections against Consumer (100102 Cr)</b><span><input class="num-in cp41-rev" data-k="consumerCr" value="${c.rev.consumerCr}"></span>
    <b>Collection Exp adj (710000 Dr)</b><span><input class="num-in cp41-rev" data-k="collExp" value="${c.rev.collExp}"></span>
  </div>
  <div class="row"><button class="btn gold" id="genCP41" ${locked() ? "disabled" : ""}>Generate Summaries (Folio 3 + 4)</button>
  <button class="btn ghost" id="printCP41">Print CP-41</button></div>
  <h2>CP-41 Upload / Export</h2>
  <p class="muted">Sale upload: columns <b>Category, GL Code, Variable, Fix, LPF, AQTA</b>. Taxes upload: <b>Tax, Receivable Code, Payable Code, Collection Code, OB, Assessment, Payments, Commission</b>.</p>
  <div class="row"><label>Sale file: <input type="file" id="cp41SaleFile" accept=".csv,.xlsx,.xls,.txt"></label>
  <label>Taxes file: <input type="file" id="cp41TaxFile" accept=".csv,.xlsx,.xls,.txt"></label></div>
  <div class="row"><button class="btn ghost" id="cp41SaleCsv">Sale CSV Download (Export)</button>
  <button class="btn ghost" id="cp41TaxCsv">Taxes CSV Download (Export)</button></div></div>`;
}
function bCP41() {
  const upd = async (fn) => { fn(); await save(); render(); };
  document.querySelectorAll(".cp41-sale").forEach((el) => el.onchange = () => upd(() => (M().cp41.sale[+el.dataset.i][el.dataset.k] = num(el.value))));
  document.querySelectorAll(".cp41-oth").forEach((el) => el.onchange = () => upd(() => (M().cp41.other[+el.dataset.i].amount = num(el.value))));
  document.querySelectorAll(".cp41-tax").forEach((el) => el.onchange = () => upd(() => (M().cp41.taxes[+el.dataset.i][el.dataset.k] = num(el.value))));
  document.querySelectorAll(".cp41-rev").forEach((el) => el.onchange = () => upd(() => (M().cp41.rev[el.dataset.k] = num(el.value))));
  const gen = document.getElementById("genCP41");
  if (gen) gen.onclick = async () => {
    const c = M().cp41; const t = cp41Totals(); const lines = [];
    c.sale.forEach((r) => lines.push({ folio: 3, source: "CP-41 Sale", code: r.code, dr: 0, cr: num(r.var) + num(r.fix) + num(r.lpf) + num(r.aqta) }));
    c.other.forEach((r) => lines.push({ folio: 3, source: "CP-41 Other Revenue", code: r.code, dr: 0, cr: num(r.amount) }));
    lines.push({ folio: 3, source: "CP-41 Sale", code: "100102", dr: t.consumerDr, cr: 0 });
    c.taxes.forEach((r) => {
      lines.push({ folio: 4, source: "CP-41 Tax " + r.name, code: r.rec, dr: num(r.ass), cr: num(r.pmt) });
      if (r.pay) lines.push({ folio: 4, source: "CP-41 Tax " + r.name, code: r.pay, dr: num(r.pmt), cr: num(r.ass) });
      if (r.name === "GST") lines.push({ folio: 4, source: "CP-41 Tax GST", code: r.col, dr: 0, cr: num(r.ass) });
      else if (r.commCode) {
        lines.push({ folio: 4, source: "CP-41 Tax " + r.name, code: r.col, dr: num(r.comm), cr: num(r.pmt) });
        lines.push({ folio: 4, source: "CP-41 Tax " + r.name + " Commission", code: r.commCode, dr: 0, cr: num(r.comm) });
      } else lines.push({ folio: 4, source: "CP-41 Tax " + r.name, code: r.col, dr: 0, cr: num(r.pmt) });
    });
    lines.push({ folio: 4, source: "CP-41 Revenue Collection", code: "170301", dr: num(c.rev.collections), cr: num(c.rev.bankActual) });
    lines.push({ folio: 4, source: "CP-41 Revenue Collection", code: "150200", dr: num(c.rev.bankActual), cr: 0 });
    lines.push({ folio: 4, source: "CP-41 Revenue Collection", code: "100102", dr: 0, cr: num(c.rev.consumerCr) });
    lines.push({ folio: 4, source: "CP-41 Revenue Collection", code: "710000", dr: num(c.rev.collExp), cr: 0 });
    replaceBatch("CP41-GEN", lines);
    await save(); toast("CP-41 se " + lines.length + " summary lines ban gayi (Folio 3+4)"); currentView = "summaries"; render();
  };
  document.getElementById("cp41SaleFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rows = await readFileRows(f); let n = 0;
      rows.forEach((r) => {
        const cells = r.map((x) => String(x ?? "").trim());
        let code, v, fx, l, a;
        if (cells.length >= 6) { code = cells[1]; [, , v, fx, l, a] = cells; }
        else if (cells.length === 5) { [code, v, fx, l, a] = cells; }
        else return;
        const row = M().cp41.sale.find((x) => x.code === code);
        if (row) { row.var = num(v); row.fix = num(fx); row.lpf = num(l); row.aqta = num(a); n++; }
      });
      await save(); toast(n + " sale categories update ho gayi"); render();
    } catch (err) { toast("Upload fail: " + err.message); }
  };
  document.getElementById("cp41TaxFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rows = await readFileRows(f); let n = 0;
      rows.forEach((r) => {
        const cells = r.map((x) => String(x ?? "").trim());
        let rec, ob, ass, pmt, comm;
        if (cells.length >= 8) { rec = cells[1]; ob = cells[4]; ass = cells[5]; pmt = cells[6]; comm = cells[7]; }
        else if (cells.length === 5) { [rec, ob, ass, pmt, comm] = cells; }
        else return;
        const row = M().cp41.taxes.find((x) => x.rec === rec);
        if (row) { row.ob = num(ob); row.ass = num(ass); row.pmt = num(pmt); row.comm = num(comm); n++; }
      });
      await save(); toast(n + " taxes update ho gayi"); render();
    } catch (err) { toast("Upload fail: " + err.message); }
  };
  document.getElementById("cp41SaleCsv").onclick = () => downloadCSV("cp41-sale-" + S.currentMonth + ".csv", [["Category", "GL Code", "Variable", "Fix Charges", "LPF", "AQTA", "Total"], ...M().cp41.sale.map((r) => [r.cat, r.code, r.var, r.fix, r.lpf, r.aqta, num(r.var) + num(r.fix) + num(r.lpf) + num(r.aqta)])]);
  document.getElementById("cp41TaxCsv").onclick = () => downloadCSV("cp41-taxes-" + S.currentMonth + ".csv", [["Tax", "Receivable Code", "Payable Code", "Collection Code", "OB", "Assessment", "Payments", "Commission", "CB"], ...M().cp41.taxes.map((r) => [r.name, r.rec, r.pay || "", r.col, r.ob, r.ass, r.pmt, r.comm, num(r.ob) + num(r.ass) - num(r.pmt)])]);
  document.getElementById("printCP41").onclick = () => {
    const c = M().cp41; const t = cp41Totals();
    const saleRows = c.sale.map((r) => `<tr><td>${esc(r.cat)}</td><td class="num">${fmt(r.var)}</td><td class="num">${fmt(r.fix)}</td><td class="num">${fmt(r.lpf)}</td><td class="num">${fmt(r.aqta)}</td><td class="num">${fmt(num(r.var) + num(r.fix) + num(r.lpf) + num(r.aqta))}</td></tr>`).join("");
    const taxRows = c.taxes.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${fmt(r.ob)}</td><td class="num">${fmt(r.ass)}</td><td class="num">${fmt(r.pmt)}</td><td class="num">${fmt(num(r.ob) + num(r.ass) - num(r.pmt))}</td></tr>`).join("");
    printDoc("CP-41 — Sale, Taxes & Revenue Collections", `<h3>Sale</h3><table><tr><th>Particulars</th><th class="num">Variable</th><th class="num">Fix Charges</th><th class="num">L.P.F</th><th class="num">AQTA</th><th class="num">Total</th></tr>${saleRows}<tr class="total"><td>TOTAL SALE</td><td colspan="4"></td><td class="num">${fmt(t.saleTot)}</td></tr></table><h3>Taxes (OB / Assessment / Payments / CB)</h3><table><tr><th>Tax</th><th class="num">OB</th><th class="num">Assessment</th><th class="num">Payments</th><th class="num">CB</th></tr>${taxRows}</table>`);
  };
}
function replaceBatch(batch, lines) {
  const m = M();
  m.postings = m.postings.filter((p) => p.batch !== batch);
  lines.forEach((l) => m.postings.push({ id: uid(), ...l, batch }));
}

// ---------- Payroll ----------
function vPayroll() {
  const p = M().payroll;
  const gross = p.dr.reduce((s, r) => s + num(r.amount), 0);
  const ded = p.cr.reduce((s, r) => s + num(r.amount), 0);
  const drRows = p.dr.map((r, i) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td><input class="num-in pay-dr" data-i="${i}" value="${r.amount}"></td></tr>`).join("");
  const crRows = p.cr.map((r, i) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td><input class="num-in pay-cr" data-i="${i}" value="${r.amount}"></td></tr>`).join("");
  return `<h1>Payroll Entry — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Pay components (Dr) aur deductions (Cr). Net Pay (302100 Cr) auto. "Generate" se Folio 1 banta hai.</div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">Pay Components (Dr)</h2>
  <table><tr><th>Component</th><th>GL Code</th><th class="num">Amount</th></tr>${drRows}
  <tr class="total"><td colspan="2">GROSS PAY</td><td class="num">${fmt(gross)}</td></tr></table>
  <h2>Deductions (Cr)</h2>
  <table><tr><th>Deduction</th><th>GL Code</th><th class="num">Amount</th></tr>${crRows}
  <tr class="total"><td colspan="2">TOTAL DEDUCTIONS</td><td class="num">${fmt(ded)}</td></tr>
  <tr class="total"><td colspan="2">NET PAY (302100 Cr)</td><td class="num">${fmt(gross - ded)}</td></tr></table>
  <div class="row"><button class="btn gold" id="genPay" ${locked() ? "disabled" : ""}>Generate Summaries (Folio 1)</button>
  <button class="btn ghost" id="printPay">Print Payroll Summary</button></div>
  <h2>Payroll Upload / Export</h2>
  <p class="muted">Upload columns: <b>Type (Dr/Cr), Name, GL Code, Amount</b> — poori payroll list replace ho jayegi.</p>
  <div class="row"><input type="file" id="payFile" accept=".csv,.xlsx,.xls,.txt">
  <button class="btn ghost" id="payCsv">Payroll CSV Download (Export)</button></div></div>`;
}
function bPayroll() {
  document.querySelectorAll(".pay-dr").forEach((el) => el.onchange = async () => { M().payroll.dr[+el.dataset.i].amount = num(el.value); await save(); render(); });
  document.querySelectorAll(".pay-cr").forEach((el) => el.onchange = async () => { M().payroll.cr[+el.dataset.i].amount = num(el.value); await save(); render(); });
  const gen = document.getElementById("genPay");
  if (gen) gen.onclick = async () => {
    const p = M().payroll; const lines = [];
    p.dr.forEach((r) => lines.push({ folio: 1, source: "Payroll", code: r.code, dr: num(r.amount), cr: 0 }));
    p.cr.forEach((r) => lines.push({ folio: 1, source: "Payroll Deduction", code: r.code, dr: 0, cr: num(r.amount) }));
    const gross = p.dr.reduce((s, r) => s + num(r.amount), 0), ded = p.cr.reduce((s, r) => s + num(r.amount), 0);
    lines.push({ folio: 1, source: "Payroll Net Pay", code: "302100", dr: 0, cr: gross - ded });
    replaceBatch("PAYROLL-GEN", lines);
    await save(); toast("Payroll se " + lines.length + " lines ban gayi (Folio 1)"); currentView = "summaries"; render();
  };
  document.getElementById("payFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rows = await readFileRows(f); const dr = [], cr = [];
      rows.forEach((r) => {
        const cells = r.map((x) => String(x ?? "").trim());
        if (cells.length < 4 || /type/i.test(cells[0])) return;
        const item = { name: cells[1], code: cells[2], amount: num(cells[3]) };
        if (!item.code) return;
        (/cr/i.test(cells[0]) ? cr : dr).push(item);
      });
      if (!dr.length && !cr.length) return toast("Payroll data nahi mila — format check karein");
      if (!confirm("Payroll list replace karein? Dr " + dr.length + " lines, Cr " + cr.length + " lines mili hain.")) return;
      M().payroll = { dr, cr }; await save(); toast("Payroll import ho gaya"); render();
    } catch (err) { toast("Upload fail: " + err.message); }
  };
  document.getElementById("payCsv").onclick = () => downloadCSV("payroll-" + S.currentMonth + ".csv", [["Type", "Name", "GL Code", "Amount"], ...M().payroll.dr.map((r) => ["Dr", r.name, r.code, r.amount]), ...M().payroll.cr.map((r) => ["Cr", r.name, r.code, r.amount])]);
  document.getElementById("printPay").onclick = () => {
    const p = M().payroll; const gross = p.dr.reduce((s, r) => s + num(r.amount), 0), ded = p.cr.reduce((s, r) => s + num(r.amount), 0);
    const dr = p.dr.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td class="num">${fmt(r.amount)}</td></tr>`).join("");
    const cr = p.cr.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td class="num">${fmt(r.amount)}</td></tr>`).join("");
    printDoc("Pay Roll Summary", `<table><tr><th>Component</th><th>Code</th><th class="num">Dr</th></tr>${dr}<tr class="total"><td colspan="2">GROSS</td><td class="num">${fmt(gross)}</td></tr></table><br><table><tr><th>Deduction</th><th>Code</th><th class="num">Cr</th></tr>${cr}<tr class="total"><td colspan="2">TOTAL DEDUCTIONS</td><td class="num">${fmt(ded)}</td></tr><tr class="total"><td colspan="2">NET PAY</td><td class="num">${fmt(gross - ded)}</td></tr></table>`);
  };
}

// ---------- CP-91 Detail & Abstract ----------
function cp91Abstract() {
  return M().cp91.detail.map((co) => ({
    code: co.code, iot: co.iot, desc: co.desc,
    amount: co.offices.reduce((s, o) => s + num(o.amount), 0),
    count: co.offices.reduce((s, o) => s + num(o.no), 0)
  }));
}
function vCP91() {
  const c = M().cp91;
  const abs = cp91Abstract();
  const grand = abs.reduce((s, r) => s + r.amount, 0);
  const sections = c.detail.map((co, ci) => {
    const tot = co.offices.reduce((s, o) => s + num(o.amount), 0);
    const rows = co.offices.map((o, oi) => `<tr><td>${oi + 1}</td>
      <td><input class="cp91-fs" data-ci="${ci}" data-oi="${oi}" value="${esc(o.fs)}" style="width:90px"></td>
      <td><input class="cp91-name" data-ci="${ci}" data-oi="${oi}" value="${esc(o.name)}" style="width:340px"></td>
      <td><input class="num-in cp91-no" data-ci="${ci}" data-oi="${oi}" value="${o.no}" style="width:80px"></td>
      <td><input class="num-in cp91-amt" data-ci="${ci}" data-oi="${oi}" value="${o.amount}"></td>
      <td><button class="btn small danger" data-del-office="${ci}:${oi}">✕</button></td></tr>`).join("");
    return `<div class="card"><h2 style="margin-top:0">${esc(co.iot)} (${esc(co.code)}) — Total ${fmt(tot)}</h2>
    <table><tr><th>Sr</th><th>F/S Code</th><th>Name and Address of Office</th><th class="num">No. of CP-91</th><th class="num">Amount</th><th></th></tr>${rows}
    <tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(tot)}</td><td></td></tr></table>
    <div class="row"><button class="btn small ghost" data-add-office="${ci}">+ Office add karein</button></div></div>`;
  }).join("");
  const absRows = abs.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.iot)}</td><td>${esc(r.desc)}</td><td class="num">${fmt(r.amount)}</td></tr>`).join("");
  return `<h1>CP-91 Detail & Abstract — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Pehle CP-91 detail (office-wise) bharein — Abstract khud banta hai. Grand Total: <b>${fmt(grand)}</b></div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">CP-91 Upload karein (Excel / CSV)</h2>
  <p class="muted">Aap ki CP-91 sheet wala format bhi chalega (company sections ke saath), ya simple columns: <b>Company Code, F/S Code, Office Name, No, Amount</b>.</p>
  <div class="row"><input type="file" id="cp91File" accept=".csv,.xlsx,.xls,.txt">
  <button class="btn ghost" id="cp91Csv">Detail CSV Download</button>
  <button class="btn ghost" id="cp91AbsCsv">Abstract CSV Download</button></div></div>
  ${sections}
  <div class="card"><h2 style="margin-top:0">ABSTRACT CP-91 (Auto — Detail se bana)</h2>
  <div class="table-wrap"><table><tr><th>Sr</th><th>Code</th><th>Company (IOT)</th><th>Description</th><th class="num">Amount</th></tr>${absRows}
  <tr class="total"><td colspan="4">GRAND TOTAL</td><td class="num">${fmt(grand)}</td></tr></table></div>
  <div class="kv" style="margin-top:12px">
    <b>Free supply to Retd Employee (520603 Dr)</b><span><input class="num-in" id="cp91e1" value="${c.extra520603}"></span>
    <b>Free Supply Receivable (150101-6 Dr)</b><span><input class="num-in" id="cp91e2" value="${c.extra1501016}"></span>
  </div>
  <div class="row"><button class="btn gold" id="genCP91" ${locked() ? "disabled" : ""}>Generate Summaries (CP-91 lines)</button>
  <button class="btn ghost" id="printCP91Detail">Print CP-91 Detail</button>
  <button class="btn ghost" id="printCP91Abs">Print Abstract</button></div></div>`;
}
function parseCP91Rows(rows) {
  // Format 1: CP-91 sheet style (company section headers)
  const companies = []; let cur = null; let found = false;
  rows.forEach((r) => {
    const cells = r.map((x) => String(x ?? "").trim());
    const joined = cells.join(" ");
    if (/OFFICE\/CODE WISE DETAIL/i.test(joined)) {
      const m = joined.match(/\((\d+)\)/);
      const name = cells.find((x) => /OFFICE\/CODE/i.test(x)) || joined;
      cur = { code: m ? m[1] : "", iot: name.split("(")[0].trim(), desc: "F.D " + name.split("(")[0].trim(), offices: [] };
      companies.push(cur); found = true; return;
    }
    if (cur && cells.length >= 6) {
      const [, sr, fs, name, no, amt] = cells;
      if (name && !/Name and Adress/i.test(name) && !/Divisional Accounts/i.test(name) && sr !== "TOTAL" && (amt !== "" || fs !== "")) {
        cur.offices.push({ fs, name, no: num(no), amount: num(amt) });
      }
    }
  });
  if (found && companies.some((c) => c.offices.length)) return companies;
  // Format 2: simple columns CompanyCode, FSCode, OfficeName, No, Amount
  const map = {};
  rows.forEach((r) => {
    const cells = r.map((x) => String(x ?? "").trim());
    if (cells.length < 5 || /company/i.test(cells[0])) return;
    const [code, fs, name, no, amt] = cells;
    if (!code || !name) return;
    map[code] = map[code] || { code, iot: code, desc: "F.D " + code, offices: [] };
    map[code].offices.push({ fs, name, no: num(no), amount: num(amt) });
  });
  return Object.values(map);
}
function bCP91() {
  const upd = async (fn) => { fn(); await save(); render(); };
  document.querySelectorAll(".cp91-fs").forEach((el) => el.onchange = () => upd(() => (M().cp91.detail[+el.dataset.ci].offices[+el.dataset.oi].fs = el.value)));
  document.querySelectorAll(".cp91-name").forEach((el) => el.onchange = () => upd(() => (M().cp91.detail[+el.dataset.ci].offices[+el.dataset.oi].name = el.value)));
  document.querySelectorAll(".cp91-no").forEach((el) => el.onchange = () => upd(() => (M().cp91.detail[+el.dataset.ci].offices[+el.dataset.oi].no = num(el.value))));
  document.querySelectorAll(".cp91-amt").forEach((el) => el.onchange = () => upd(() => (M().cp91.detail[+el.dataset.ci].offices[+el.dataset.oi].amount = num(el.value))));
  document.querySelectorAll("[data-del-office]").forEach((b) => b.onclick = () => { const [ci, oi] = b.dataset.delOffice.split(":").map(Number); upd(() => M().cp91.detail[ci].offices.splice(oi, 1)); });
  document.querySelectorAll("[data-add-office]").forEach((b) => b.onclick = () => upd(() => M().cp91.detail[+b.dataset.addOffice].offices.push({ fs: "", name: "", no: 0, amount: 0 })));
  document.getElementById("cp91e1").onchange = async (e) => { M().cp91.extra520603 = num(e.target.value); await save(); };
  document.getElementById("cp91e2").onchange = async (e) => { M().cp91.extra1501016 = num(e.target.value); await save(); };
  document.getElementById("cp91File").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rows = await readFileRows(f);
      const companies = parseCP91Rows(rows);
      if (!companies.length) return toast("CP-91 data nahi mila — format check karein");
      if (!confirm(companies.length + " companies ki detail mili. Maujooda CP-91 detail replace karein?")) return;
      // seed companies ke naam/desc barqarar rakhein jahan code match ho
      const seedMap = {}; SEED.cp91Detail.forEach((c) => (seedMap[c.code] = c));
      companies.forEach((c) => { if (seedMap[c.code]) { c.iot = seedMap[c.code].iot; c.desc = seedMap[c.code].desc; } });
      M().cp91.detail = companies;
      await save(); toast("CP-91 detail import ho gayi — Abstract auto ban gaya"); render();
    } catch (err) { toast("Upload fail: " + err.message); }
  };
  document.getElementById("cp91Csv").onclick = () => {
    const rows = [["Company Code", "Company", "F/S Code", "Office Name", "No of CP-91", "Amount"]];
    M().cp91.detail.forEach((co) => co.offices.forEach((o) => rows.push([co.code, co.iot, o.fs, o.name, o.no, o.amount])));
    downloadCSV("cp91-detail-" + S.currentMonth + ".csv", rows);
  };
  document.getElementById("cp91AbsCsv").onclick = () => downloadCSV("cp91-abstract-" + S.currentMonth + ".csv", [["Sr", "Code", "Company", "Description", "Amount"], ...cp91Abstract().map((r, i) => [i + 1, r.code, r.iot, r.desc, r.amount])]);
  const gen = document.getElementById("genCP91");
  if (gen) gen.onclick = async () => {
    const c = M().cp91; const tot = cp91Abstract().reduce((s, r) => s + r.amount, 0);
    replaceBatch("CP91-GEN", [
      { folio: 3, source: "CP-91", code: "300101", dr: tot, cr: 0 },
      { folio: 3, source: "CP-91", code: "520603", dr: num(c.extra520603), cr: 0 },
      { folio: 3, source: "CP-91", code: "150101-6", dr: num(c.extra1501016), cr: 0 },
      { folio: 3, source: "CP-91", code: "520401", dr: 0, cr: tot + num(c.extra520603) + num(c.extra1501016) }
    ]);
    await save(); toast("CP-91 lines ban gayi (Abstract total " + fmt(tot) + ")"); currentView = "summaries"; render();
  };
  document.getElementById("printCP91Detail").onclick = () => {
    const body = M().cp91.detail.filter((co) => co.offices.length).map((co) => {
      const tot = co.offices.reduce((s, o) => s + num(o.amount), 0);
      const rows = co.offices.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.fs)}</td><td>${esc(o.name)}</td><td class="num">${fmt(o.no)}</td><td class="num">${fmt(o.amount)}</td></tr>`).join("");
      return `<h3>${esc(co.iot)} (${esc(co.code)}) — Office/Code Wise Detail of Free Supply</h3><table><tr><th>Sr</th><th>F/S Code</th><th>Name and Address of Office</th><th class="num">No. of CP-91 Attached</th><th class="num">Amount</th></tr>${rows}<tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(tot)}</td></tr></table>`;
    }).join("");
    printDoc("CP-91 — Office/Code Wise Detail of Free Supply", body);
  };
  document.getElementById("printCP91Abs").onclick = () => {
    const abs = cp91Abstract(); const grand = abs.reduce((s, r) => s + r.amount, 0);
    const rows = abs.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.code)}</td><td>${esc(r.iot)}</td><td>${esc(r.desc)}</td><td class="num">${fmt(r.amount)}</td></tr>`).join("");
    printDoc("Detail of Free Electricity Supply (CP-91 Abstract)", `<table><tr><th>Sr</th><th>Code</th><th>Company (IOT)</th><th>Description</th><th class="num">Amount</th></tr>${rows}<tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(grand)}</td></tr></table>`);
  };
}

// ---------- Summaries ----------
let uploadPreview = [];
function vSummaries() {
  const m = M();
  const totDr = m.postings.reduce((s, p) => s + num(p.dr), 0), totCr = m.postings.reduce((s, p) => s + num(p.cr), 0);
  const batches = [...new Set(m.postings.map((p) => p.batch))];
  const rows = m.postings.map((p) => `<tr><td>${esc(p.folio)}</td><td>${esc(p.source)}</td><td><b>${esc(p.code)}</b></td>
    <td class="num">${fmt(p.dr)}</td><td class="num">${fmt(p.cr)}</td><td>${esc(p.batch)}</td>
    <td><button class="btn small danger" data-del-post="${p.id}">✕</button></td></tr>`).join("");
  const prev = uploadPreview.length ? `<div class="card"><h2 style="margin-top:0">Upload Preview — ${uploadPreview.length} lines</h2>
    <div class="table-wrap"><table><tr><th>Folio</th><th>Source</th><th>GL Code</th><th class="num">Dr</th><th class="num">Cr</th></tr>
    ${uploadPreview.slice(0, 30).map((p) => `<tr><td>${esc(p.folio)}</td><td>${esc(p.source)}</td><td>${esc(p.code)}</td><td class="num">${fmt(p.dr)}</td><td class="num">${fmt(p.cr)}</td></tr>`).join("")}</table></div>
    <div class="row"><input id="batchName" placeholder="Batch ka naam (maslan August Summaries)" style="width:280px">
    <button class="btn gold" id="importBtn">Import karein</button><button class="btn ghost" id="cancelPrev">Cancel</button></div></div>` : "";
  return `<h1>Ledger Posting Summaries — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Total Dr ${fmt(totDr)} &nbsp;|&nbsp; Total Cr ${fmt(totCr)} &nbsp;|&nbsp; Difference <b style="color:${Math.abs(totDr - totCr) > 0.5 ? "var(--red)" : "inherit"}">${fmt(totDr - totCr)}</b></div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">Summaries Upload karein (Excel / CSV)</h2>
  <p class="muted">File mein columns hon: <b>Folio, Source, GL Code, Dr, Cr</b> (header ho ya na ho, dono chalega). Ya neeche box mein Excel se copy-paste karein.</p>
  <div class="row"><input type="file" id="upFile" accept=".csv,.xlsx,.xls,.txt"></div>
  <textarea id="upPaste" placeholder="Yahan paste karein — har line: Folio, Source, GL Code, Dr, Cr"></textarea>
  <div class="row"><button class="btn" id="parsePaste">Paste ko parhein</button></div></div>
  ${prev}
  <div class="card"><h2 style="margin-top:0">Ek line manual add karein</h2>
  <div class="row">
    <input id="mpFolio" placeholder="Folio" style="width:80px"><input id="mpSource" placeholder="Source (maslan Imprest)" style="width:200px">
    <input id="mpCode" placeholder="GL Code" style="width:130px"><input id="mpDr" placeholder="Dr" class="num-in"><input id="mpCr" placeholder="Cr" class="num-in">
    <button class="btn" id="addPost" ${locked() ? "disabled" : ""}>Add</button>
  </div>
  <div class="row"><span class="muted">Batches:</span> ${batches.map((b) => `<span class="badge warn">${esc(b)}</span> <button class="btn small danger" data-del-batch="${esc(b)}">batch delete</button>`).join(" ")}
  <button class="btn ghost" id="printSum">Print Summaries</button>
  <button class="btn ghost" id="csvSum">CSV Download</button></div></div>
  <div class="table-wrap"><table><tr><th>Folio</th><th>Source</th><th>GL Code</th><th class="num">Dr</th><th class="num">Cr</th><th>Batch</th><th></th></tr>${rows}
  <tr class="total"><td colspan="3">TOTAL</td><td class="num">${fmt(totDr)}</td><td class="num">${fmt(totCr)}</td><td colspan="2"></td></tr></table></div>`;
}
function parseSummarySheet(rows) {
  // Aap ki SUMMARY sheet wala format: Folio blocks, Account Code col B, Dr col C, Cr col D
  const out = []; let folio = "—", source = "";
  rows.forEach((r) => {
    const c = r.map((x) => String(x ?? "").trim());
    if (/^\d+$/.test(c[0] || "") && c[2] && !/PARTICULARS/i.test(c[2]) && isNaN(num(c[2]))) { folio = c[0]; source = c[2]; return; }
    const code = c[1] || "";
    if (/^[0-9][0-9A-Za-z\-]*$/.test(code) && (c[2] !== "" || c[3] !== "") && !isNaN(num(c[2])) && !isNaN(num(c[3]))) {
      if (num(c[2]) === 0 && num(c[3]) === 0 && c[2] === "" && c[3] === "") return;
      out.push({ folio, source: source || "SUMMARY", code, dr: num(c[2]), cr: num(c[3]) });
    }
  });
  return out;
}
function parseRows(rows) {
  const out = [];
  rows.forEach((r) => {
    if (!r || r.length < 3) return;
    const cells = r.map((c) => String(c ?? "").trim());
    if (/folio/i.test(cells[0]) && /code/i.test(cells.join(" "))) return; // header
    let folio, source, code, dr, cr;
    if (cells.length >= 5) { [folio, source, code, dr, cr] = cells; }
    else if (cells.length === 4) { folio = ""; [source, code, dr, cr] = cells; }
    else { folio = ""; source = ""; [code, dr, cr] = cells; }
    if (!code || isNaN(num(dr)) && isNaN(num(cr))) return;
    out.push({ folio: folio || "—", source: source || "Upload", code, dr: num(dr), cr: num(cr) });
  });
  return out;
}
function bSummaries() {
  const fileEl = document.getElementById("upFile");
  fileEl.onchange = async () => {
    const f = fileEl.files[0]; if (!f) return;
    try {
      if (/\.csv$|\.txt$/i.test(f.name)) {
        const text = await f.text();
        const rows = text.split(/\r?\n/).map((l) => l.split(/[,\t;]/));
        const sumParsed = parseSummarySheet(rows);
        uploadPreview = sumParsed.length >= 5 ? sumParsed : parseRows(rows);
      } else {
        const sheets = await readWorkbookSheets(f);
        const names = Object.keys(sheets);
        const sumName = names.find((n) => /summary/i.test(n));
        let parsed = [];
        if (sumName) parsed = parseSummarySheet(sheets[sumName]);
        if (parsed.length < 5) {
          for (const n of names) { const p2 = parseSummarySheet(sheets[n]); if (p2.length > parsed.length) parsed = p2; }
        }
        uploadPreview = parsed.length >= 5 ? parsed : parseRows(sheets[sumName || names[0]]);
      }
      toast(uploadPreview.length + " lines mili — preview dekhein");
      render();
    } catch (e) { toast("File parhne mein masla: " + e.message); }
  };
  document.getElementById("parsePaste").onclick = () => {
    const text = document.getElementById("upPaste").value;
    uploadPreview = parseRows(text.split(/\r?\n/).map((l) => l.split(/[,\t;]/)));
    toast(uploadPreview.length + " lines mili — preview dekhein"); render();
  };
  const imp = document.getElementById("importBtn");
  if (imp) imp.onclick = async () => {
    const batch = document.getElementById("batchName").value.trim() || ("Upload " + new Date().toLocaleDateString());
    uploadPreview.forEach((p) => M().postings.push({ id: uid(), ...p, batch }));
    uploadPreview = []; await save(); toast("Import ho gaya — batch: " + batch); render();
  };
  const cp = document.getElementById("cancelPrev");
  if (cp) cp.onclick = () => { uploadPreview = []; render(); };
  const add = document.getElementById("addPost");
  if (add) add.onclick = async () => {
    const code = document.getElementById("mpCode").value.trim();
    if (!code) return toast("GL Code likhein");
    M().postings.push({ id: uid(), folio: document.getElementById("mpFolio").value.trim() || "—", source: document.getElementById("mpSource").value.trim() || "Manual", code, dr: num(document.getElementById("mpDr").value), cr: num(document.getElementById("mpCr").value), batch: "Manual" });
    await save(); render();
  };
  document.querySelectorAll("[data-del-post]").forEach((b) => b.onclick = async () => { M().postings = M().postings.filter((p) => p.id !== b.dataset.delPost); await save(); render(); });
  document.querySelectorAll("[data-del-batch]").forEach((b) => b.onclick = async () => {
    if (!confirm("Batch '" + b.dataset.delBatch + "' ki saari lines delete karein?")) return;
    M().postings = M().postings.filter((p) => p.batch !== b.dataset.delBatch); await save(); render();
  });
  document.getElementById("printSum").onclick = () => {
    const m = M();
    const rows = m.postings.map((p) => `<tr><td>${esc(p.folio)}</td><td>${esc(p.source)}</td><td>${esc(p.code)}</td><td class="num">${fmt(p.dr)}</td><td class="num">${fmt(p.cr)}</td></tr>`).join("");
    const td = m.postings.reduce((s, p) => s + num(p.dr), 0), tc = m.postings.reduce((s, p) => s + num(p.cr), 0);
    printDoc("Ledger Posting Summary", `<table><tr><th>Folio</th><th>Particulars</th><th>Account Code</th><th class="num">Dr</th><th class="num">Cr</th></tr>${rows}<tr class="total"><td colspan="3">TOTAL</td><td class="num">${fmt(td)}</td><td class="num">${fmt(tc)}</td></tr></table>`);
  };
  document.getElementById("csvSum").onclick = () => downloadCSV("summaries-" + S.currentMonth + ".csv", [["Folio", "Source", "GL Code", "Dr", "Cr"], ...M().postings.map((p) => [p.folio, p.source, p.code, p.dr, p.cr])]);
}
function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click();
}

// ---------- Journal Vouchers ----------
let jvDraft = null;
function vJV() {
  const m = M();
  const list = m.jvs.map((j) => {
    const td = j.lines.reduce((s, l) => s + num(l.dr), 0), tc = j.lines.reduce((s, l) => s + num(l.cr), 0);
    const bal = Math.abs(td - tc) < 0.5;
    return `<tr><td>${esc(j.date)}</td><td>${esc(j.narration)}</td><td class="num">${fmt(td)}</td><td class="num">${fmt(tc)}</td>
    <td>${bal ? '<span class="badge ok">Balanced</span>' : '<span class="badge bad">Unbalanced</span>'} ${j.posted ? '<span class="badge bs">Posted</span>' : '<span class="badge warn">Draft</span>'}</td>
    <td><button class="btn small ghost" data-print-jv="${j.id}">Print</button>
    ${j.posted ? `<button class="btn small ghost" data-unpost-jv="${j.id}">Unpost</button>` : `<button class="btn small" data-post-jv="${j.id}">Post</button>`}
    <button class="btn small danger" data-del-jv="${j.id}">✕</button></td></tr>`;
  }).join("");
  let draftHtml = "";
  if (jvDraft) {
    const td = jvDraft.lines.reduce((s, l) => s + num(l.dr), 0), tc = jvDraft.lines.reduce((s, l) => s + num(l.cr), 0);
    draftHtml = `<div class="card"><h2 style="margin-top:0">Naya Journal Voucher</h2>
    <div class="row"><input type="date" id="jvDate" value="${jvDraft.date}"><input id="jvNar" placeholder="Narration (wajah likhein)" style="flex:1;min-width:280px" value="${esc(jvDraft.narration)}"></div>
    ${jvDraft.lines.map((l, i) => `<div class="jv-line">
      <input class="code jv-code" data-i="${i}" placeholder="GL Code" value="${esc(l.code)}" list="coaList">
      <input class="amt jv-dr" data-i="${i}" placeholder="Dr" value="${l.dr || ""}">
      <input class="amt jv-cr" data-i="${i}" placeholder="Cr" value="${l.cr || ""}">
      <button class="btn small danger" data-del-line="${i}">✕</button></div>`).join("")}
    <datalist id="coaList">${S.coa.map((c) => `<option value="${esc(c.code)}">${esc(c.desc)}</option>`).join("")}</datalist>
    <div class="row"><button class="btn ghost small" id="addLine">+ Line</button>
    <span>Total Dr <b>${fmt(td)}</b> | Total Cr <b>${fmt(tc)}</b> | Difference <b style="color:${Math.abs(td - tc) > 0.5 ? "var(--red)" : "inherit"}">${fmt(td - tc)}</b></span></div>
    <div class="row"><button class="btn gold" id="saveJV">Save JV (Draft)</button><button class="btn" id="savePostJV">Save + Post</button><button class="btn ghost" id="cancelJV">Cancel</button></div></div>`;
  }
  return `<h1>Journal Vouchers — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Ek ek JV post karein — har adjustment ki wajah (narration) lazmi likhein. Posted JV Trial Balance mein shamil hota hai.</div>
  ${lockNote()}
  <div class="row"><button class="btn gold" id="newJV" ${locked() ? "disabled" : ""}>+ Naya Journal Voucher</button></div>
  ${draftHtml}
  <div class="table-wrap"><table><tr><th>Date</th><th>Narration</th><th class="num">Total Dr</th><th class="num">Total Cr</th><th>Status</th><th></th></tr>${list || '<tr><td colspan="6">Koi JV nahi</td></tr>'}</table></div>`;
}
function readJVDraft() {
  jvDraft.date = document.getElementById("jvDate").value;
  jvDraft.narration = document.getElementById("jvNar").value;
  document.querySelectorAll(".jv-code").forEach((el) => (jvDraft.lines[+el.dataset.i].code = el.value.trim()));
  document.querySelectorAll(".jv-dr").forEach((el) => (jvDraft.lines[+el.dataset.i].dr = num(el.value)));
  document.querySelectorAll(".jv-cr").forEach((el) => (jvDraft.lines[+el.dataset.i].cr = num(el.value)));
}
function bJV() {
  const nw = document.getElementById("newJV");
  if (nw) nw.onclick = () => { jvDraft = { id: uid(), date: new Date().toISOString().slice(0, 10), narration: "", lines: [{ code: "", dr: 0, cr: 0 }, { code: "", dr: 0, cr: 0 }], posted: false }; render(); };
  if (jvDraft) {
    document.getElementById("addLine").onclick = () => { readJVDraft(); jvDraft.lines.push({ code: "", dr: 0, cr: 0 }); render(); };
    document.querySelectorAll("[data-del-line]").forEach((b) => b.onclick = () => { readJVDraft(); jvDraft.lines.splice(+b.dataset.delLine, 1); render(); });
    const saveJV = async (post) => {
      readJVDraft();
      jvDraft.lines = jvDraft.lines.filter((l) => l.code);
      if (!jvDraft.lines.length) return toast("Kam az kam ek line likhein");
      if (!jvDraft.narration.trim()) return toast("Narration (wajah) lazmi hai");
      const td = jvDraft.lines.reduce((s, l) => s + num(l.dr), 0), tc = jvDraft.lines.reduce((s, l) => s + num(l.cr), 0);
      if (post && Math.abs(td - tc) > 0.5 && !confirm("JV balanced nahi hai (Dr−Cr = " + fmt(td - tc) + "). Phir bhi post karein?")) return;
      jvDraft.posted = post;
      M().jvs.push(jvDraft); jvDraft = null;
      await save(); toast(post ? "JV post ho gaya" : "JV draft save ho gaya"); render();
    };
    document.getElementById("saveJV").onclick = () => saveJV(false);
    document.getElementById("savePostJV").onclick = () => saveJV(true);
    document.getElementById("cancelJV").onclick = () => { jvDraft = null; render(); };
  }
  document.querySelectorAll("[data-post-jv]").forEach((b) => b.onclick = async () => { const j = M().jvs.find((x) => x.id === b.dataset.postJv); j.posted = true; await save(); toast("JV post ho gaya"); render(); });
  document.querySelectorAll("[data-unpost-jv]").forEach((b) => b.onclick = async () => { const j = M().jvs.find((x) => x.id === b.dataset.unpostJv); j.posted = false; await save(); render(); });
  document.querySelectorAll("[data-del-jv]").forEach((b) => b.onclick = async () => { if (!confirm("JV delete karein?")) return; M().jvs = M().jvs.filter((x) => x.id !== b.dataset.delJv); await save(); render(); });
  document.querySelectorAll("[data-print-jv]").forEach((b) => b.onclick = () => {
    const j = M().jvs.find((x) => x.id === b.dataset.printJv); const map = coaMap();
    const rows = j.lines.map((l) => `<tr><td>${esc(l.code)}</td><td>${esc(map[l.code]?.desc || "")}</td><td class="num">${fmt(l.dr)}</td><td class="num">${fmt(l.cr)}</td></tr>`).join("");
    const td = j.lines.reduce((s, l) => s + num(l.dr), 0), tc = j.lines.reduce((s, l) => s + num(l.cr), 0);
    printDoc("Journal Voucher", `<p><b>Date:</b> ${esc(j.date)} &nbsp;|&nbsp; <b>Narration:</b> ${esc(j.narration)}</p><table><tr><th>Account Head</th><th>Description</th><th class="num">Dr</th><th class="num">Cr</th></tr>${rows}<tr class="total"><td colspan="2">TOTAL</td><td class="num">${fmt(td)}</td><td class="num">${fmt(tc)}</td></tr></table>`);
  });
}

// ---------- Trial Balance ----------
function vTrial() {
  const t = computeTrial(S.currentMonth);
  const rows = t.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.desc)}</td><td><b>${esc(r.code)}</b></td>
    <td class="num">${fmt(r.openDr)}</td><td class="num">${fmt(r.openCr)}</td>
    <td class="num">${fmt(r.duringDr)}</td><td class="num">${fmt(r.duringCr)}</td>
    <td class="num">${fmt(r.closeDr)}</td><td class="num">${fmt(r.closeCr)}</td></tr>`).join("");
  return `<h1>Trial Balance — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Opening (previous month) + During Month (Summaries + Posted JVs) = Closing. Difference: <b style="color:${Math.abs(t.diff) > 0.5 ? "var(--red)" : "inherit"}">${fmt(t.diff)}</b></div>
  <div class="row"><button class="btn gold" id="printTrial">Print Trial Balance</button>
  <button class="btn ghost" id="printTrialBS">Print (BS / Operating alag)</button>
  <button class="btn ghost" id="csvTrial">CSV Download</button></div>
  <div class="table-wrap"><table><tr><th>Sr</th><th>Description</th><th>Code</th><th class="num">Opening Dr</th><th class="num">Opening Cr</th><th class="num">During Dr</th><th class="num">During Cr</th><th class="num">Closing Dr</th><th class="num">Closing Cr</th></tr>
  ${rows}<tr class="total"><td colspan="3">TOTAL</td><td class="num">${fmt(t.tot.openDr)}</td><td class="num">${fmt(t.tot.openCr)}</td><td class="num">${fmt(t.tot.duringDr)}</td><td class="num">${fmt(t.tot.duringCr)}</td><td class="num">${fmt(t.tot.closeDr)}</td><td class="num">${fmt(t.tot.closeCr)}</td></tr></table></div>`;
}
function bTrial() {
  const t = computeTrial(S.currentMonth);
  const tbl = (rows) => rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.desc)}</td><td>${esc(r.code)}</td><td class="num">${fmt(r.openDr)}</td><td class="num">${fmt(r.openCr)}</td><td class="num">${fmt(r.duringDr)}</td><td class="num">${fmt(r.duringCr)}</td><td class="num">${fmt(r.closeDr)}</td><td class="num">${fmt(r.closeCr)}</td></tr>`).join("");
  const head = `<tr><th>Sr</th><th>Description</th><th>Code</th><th class="num">Opening Dr</th><th class="num">Opening Cr</th><th class="num">During Dr</th><th class="num">During Cr</th><th class="num">Closing Dr</th><th class="num">Closing Cr</th></tr>`;
  const totalRow = (rows) => { const s = rows.reduce((a, r) => ({ od: a.od + r.openDr, oc: a.oc + r.openCr, dd: a.dd + r.duringDr, dc: a.dc + r.duringCr, cd: a.cd + r.closeDr, cc: a.cc + r.closeCr }), { od: 0, oc: 0, dd: 0, dc: 0, cd: 0, cc: 0 }); return `<tr class="total"><td colspan="3">TOTAL</td><td class="num">${fmt(s.od)}</td><td class="num">${fmt(s.oc)}</td><td class="num">${fmt(s.dd)}</td><td class="num">${fmt(s.dc)}</td><td class="num">${fmt(s.cd)}</td><td class="num">${fmt(s.cc)}</td></tr>`; };
  document.getElementById("printTrial").onclick = () => printDoc("Trial Balance Sheet", `<table>${head}${tbl(t.rows)}${totalRow(t.rows)}</table><p><b>Difference (Closing Dr − Cr):</b> ${fmt(t.diff)} ${Math.abs(t.diff) > 0.5 ? "(Surplus/Deficit)" : ""}</p>`);
  document.getElementById("printTrialBS").onclick = () => {
    const bs = t.rows.filter((r) => r.bs), op = t.rows.filter((r) => !r.bs);
    printDoc("Trial Balance — Balance Sheet & Operating Accounts", `<h3>Balance Sheet Accounts</h3><table>${head}${tbl(bs)}${totalRow(bs)}</table><h3>Operating Accounts</h3><table>${head}${tbl(op)}${totalRow(op)}</table>`);
  };
  document.getElementById("csvTrial").onclick = () => downloadCSV("trial-balance-" + S.currentMonth + ".csv", [["Sr", "Description", "Code", "Opening Dr", "Opening Cr", "During Dr", "During Cr", "Closing Dr", "Closing Cr"], ...t.rows.map((r, i) => [i + 1, r.desc, r.code, r.openDr, r.openCr, r.duringDr, r.duringCr, r.closeDr, r.closeCr])]);
}

// ---------- Advices ----------
function nextAdviceNo(type) {
  const count = M().advices.filter((a) => a.type === type).length + 1;
  return S.unitCode + "-" + String(count).padStart(2, "0") + "/" + (type === "DR" ? "DR" : "CR") + "-" + String(count).padStart(2, "0");
}
function vAdvices() {
  const m = M();
  const mk = (type) => {
    const list = m.advices.filter((a) => a.type === type);
    const tot = list.reduce((s, a) => s + num(a.amount), 0);
    const rows = list.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.to)}</td><td>${esc(a.no)}</td><td>${esc(a.date)}</td><td class="num">${fmt(a.amount)}</td>
      <td><button class="btn small ghost" data-print-adv="${a.id}">Print Advice</button> <button class="btn small danger" data-del-adv="${a.id}">✕</button></td></tr>`).join("");
    return { rows, tot, count: list.length };
  };
  const dr = mk("DR"), cr = mk("CR");
  return `<h1>Dr / Cr Advices — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Inter Office Advices Issued. Har advice alag print ho sakti hai, lists bhi printable hain.</div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">Nayi Advice banayein</h2>
  <div class="row">
    <select id="advType"><option value="DR">Debit Advice</option><option value="CR">Credit Advice</option></select>
    <input id="advTo" placeholder="To (Receiving Division/Office)" style="width:260px">
    <input id="advNo" placeholder="Advice No" style="width:170px">
    <input type="date" id="advDate">
    <input id="advAmt" placeholder="Amount" class="num-in">
    <input id="advNar" placeholder="Narration (maslan CP-91 / CP-128)" style="width:260px">
    <button class="btn gold" id="addAdv" ${locked() ? "disabled" : ""}>Add Advice</button>
  </div><div class="muted">Advice No khali chhodein to auto number ban jayega (maslan ${esc(nextAdviceNo("DR"))}).</div></div>
  <div class="card"><h2 style="margin-top:0">A) Debit Advices Issued (${dr.count}) — Total ${fmt(dr.tot)}</h2>
  <div class="row"><button class="btn ghost" id="printDrList">Print Dr Advice List</button> <button class="btn ghost" id="csvDrList">CSV Download</button></div>
  <div class="table-wrap"><table><tr><th>Sr</th><th>Receiving Division</th><th>Advice No</th><th>Date</th><th class="num">Amount</th><th></th></tr>${dr.rows}</table></div></div>
  <div class="card"><h2 style="margin-top:0">B) Credit Advices Issued (${cr.count}) — Total ${fmt(cr.tot)}</h2>
  <div class="row"><button class="btn ghost" id="printCrList">Print Cr Advice List</button> <button class="btn ghost" id="csvCrList">CSV Download</button></div>
  <div class="table-wrap"><table><tr><th>Sr</th><th>Receiving Division</th><th>Advice No</th><th>Date</th><th class="num">Amount</th><th></th></tr>${cr.rows}</table></div></div>`;
}
function bAdvices() {
  const add = document.getElementById("addAdv");
  if (add) add.onclick = async () => {
    const type = document.getElementById("advType").value;
    const to = document.getElementById("advTo").value.trim();
    const amt = num(document.getElementById("advAmt").value);
    if (!to || !amt) return toast("To aur Amount lazmi hain");
    M().advices.push({ id: uid(), type, to, no: document.getElementById("advNo").value.trim() || nextAdviceNo(type), date: document.getElementById("advDate").value || new Date().toISOString().slice(0, 10), amount: amt, narration: document.getElementById("advNar").value.trim() });
    await save(); toast(type + " Advice add ho gayi"); render();
  };
  document.querySelectorAll("[data-del-adv]").forEach((b) => b.onclick = async () => { M().advices = M().advices.filter((a) => a.id !== b.dataset.delAdv); await save(); render(); });
  document.querySelectorAll("[data-print-adv]").forEach((b) => b.onclick = () => {
    const a = M().advices.find((x) => x.id === b.dataset.printAdv);
    const title = a.type === "DR" ? "INTER OFFICE DEBIT ADVICE" : "INTER OFFICE CREDIT ADVICE";
    printDoc(title, `<table>
      <tr><td style="width:140px"><b>From:</b></td><td>${esc(S.unit)}</td><td style="width:80px"><b>No:</b></td><td>${esc(a.no)}</td></tr>
      <tr><td><b>To:</b></td><td>${esc(a.to)}</td><td><b>Date:</b></td><td>${esc(a.date)}</td></tr>
      <tr><td><b>Month:</b></td><td>${esc(monthLabel(S.currentMonth))}</td><td></td><td></td></tr></table>
      <p style="margin-top:18px">${a.type === "DR" ? "DEBIT" : "CREDIT"} RAISED ON ACCOUNT OF ${esc(a.narration || "—")} FOR THE MONTH ${esc(S.currentMonth)}</p>
      <table><tr><th>Particulars</th><th class="num">Amount (Rs)</th></tr>
      <tr><td>${esc(a.narration || title)}</td><td class="num">${fmt(a.amount)}</td></tr>
      <tr class="total"><td>TOTAL</td><td class="num">${fmt(a.amount)}</td></tr></table>`);
  });
  const listPrint = (type, title) => () => {
    const list = M().advices.filter((a) => a.type === type);
    const tot = list.reduce((s, a) => s + num(a.amount), 0);
    const rows = list.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.to)}</td><td>${esc(a.no)}</td><td>${esc(a.date)}</td><td class="num">${fmt(a.amount)}</td></tr>`).join("");
    printDoc(title, `<table><tr><th>Sr</th><th>Receiving Division</th><th>Advice No</th><th>Date</th><th class="num">Amount</th></tr>${rows}<tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(tot)}</td></tr></table>`);
  };
  document.getElementById("printDrList").onclick = listPrint("DR", "Debit Advices Issued — List");
  const advCsv = (type, name) => () => downloadCSV(name + "-" + S.currentMonth + ".csv", [["Sr", "Receiving Division", "Advice No", "Date", "Amount", "Narration"], ...M().advices.filter((a) => a.type === type).map((a, i) => [i + 1, a.to, a.no, a.date, a.amount, a.narration])]);
  document.getElementById("csvDrList").onclick = advCsv("DR", "dr-advices");
  document.getElementById("csvCrList").onclick = advCsv("CR", "cr-advices");
  document.getElementById("printCrList").onclick = listPrint("CR", "Credit Advices Issued — List");
}

// ---------- SS Cheques ----------
function vCheques() {
  const m = M();
  const tot = m.cheques.reduce((s, c) => s + num(c.amount), 0);
  const rows = m.cheques.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.office)}</td><td>${esc(c.cheque)}</td><td>${esc(c.date)}</td><td class="num">${fmt(c.amount)}</td>
    <td><button class="btn small danger" data-del-chq="${c.id}">✕</button></td></tr>`).join("");
  return `<h1>Superscribed Cheques — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Total: ${fmt(tot)}</div>${lockNote()}
  <div class="card"><div class="row">
    <input id="chqOffice" placeholder="Name of Office" style="width:240px"><input id="chqNo" placeholder="Cheque No" style="width:150px">
    <input type="date" id="chqDate"><input id="chqAmt" placeholder="Amount" class="num-in">
    <button class="btn gold" id="addChq" ${locked() ? "disabled" : ""}>Add Cheque</button>
    <button class="btn ghost" id="printChq">Print List (Form A-25)</button></div></div>
  <div class="table-wrap"><table><tr><th>Sr</th><th>Name of Office</th><th>Cheque No</th><th>Date</th><th class="num">Amount</th><th></th></tr>${rows}
  <tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(tot)}</td><td></td></tr></table></div>`;
}
function bCheques() {
  const add = document.getElementById("addChq");
  if (add) add.onclick = async () => {
    const office = document.getElementById("chqOffice").value.trim(), amt = num(document.getElementById("chqAmt").value);
    if (!office || !amt) return toast("Office aur Amount lazmi hain");
    M().cheques.push({ id: uid(), office, cheque: document.getElementById("chqNo").value.trim(), date: document.getElementById("chqDate").value || "", amount: amt });
    await save(); render();
  };
  document.querySelectorAll("[data-del-chq]").forEach((b) => b.onclick = async () => { M().cheques = M().cheques.filter((c) => c.id !== b.dataset.delChq); await save(); render(); });
  document.getElementById("printChq").onclick = () => {
    const m = M(); const tot = m.cheques.reduce((s, c) => s + num(c.amount), 0);
    const rows = m.cheques.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.office)}</td><td>${esc(c.cheque)}</td><td>${esc(c.date)}</td><td class="num">${fmt(c.amount)}</td></tr>`).join("");
    printDoc("Superscribed Cheques Received (Form A-25)", `<table><tr><th>Sr</th><th>Name of Office</th><th>Cheque No</th><th>Date</th><th class="num">Amount</th></tr>${rows}<tr class="total"><td colspan="4">TOTAL</td><td class="num">${fmt(tot)}</td></tr></table>`);
  };
}

// ---------- Current Account ----------
function caCalc() {
  const m = M(); const ca = m.ca;
  const drIssued = m.advices.filter((a) => a.type === "DR").reduce((s, a) => s + num(a.amount), 0);
  const crIssued = m.advices.filter((a) => a.type === "CR").reduce((s, a) => s + num(a.amount), 0);
  const ssRecv = m.cheques.reduce((s, c) => s + num(c.amount), 0);
  const closeA = num(ca.openA) + num(ca.advRecvCr) - num(ca.advRecvDr) + crIssued - drIssued;
  const closeB = num(ca.openB) + num(ca.fundsRecv) - num(ca.remitRev) - num(ca.remitSec) - num(ca.remitMisc);
  const closeC = num(ca.openC) + ssRecv;
  const closeD = num(ca.openD);
  return { drIssued, crIssued, ssRecv, closeA, closeB, closeC, closeD, net: closeA + closeB + closeC + closeD };
}
function vCurrent() {
  const ca = M().ca; const c = caCalc();
  const inp = (k, label) => `<b>${label}</b><span><input class="num-in ca-in" data-k="${k}" value="${ca[k]}"></span>`;
  return `<h1>Statement of Current Account — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">With Director Accounts GEPCO. Advices Issued aur SS Cheques auto aate hain, baqi amounts yahan likhein.</div>
  ${lockNote()}
  <div class="card"><h2 style="margin-top:0">Section A — Inter Office Transactions</h2><div class="kv">
    ${inp("openA", "Opening Balance (Cr)")}
    ${inp("advRecvDr", "Advices Received — Debit")}
    ${inp("advRecvCr", "Advices Received — Credit")}
    <b>Debit Advices Issued (auto)</b><span>${fmt(c.drIssued)}</span>
    <b>Credit Advices Issued (auto)</b><span>${fmt(c.crIssued)}</span>
    <b>Closing Balance A</b><span><b>${fmt(c.closeA)}</b></span></div></div>
  <div class="card"><h2 style="margin-top:0">Section B — Cash Transactions</h2><div class="kv">
    ${inp("openB", "Opening Balance (Dr)")}
    ${inp("fundsRecv", "Funds Received During Month")}
    ${inp("remitRev", "Funds Remitted — Revenue Collections")}
    ${inp("remitSec", "Funds Remitted — Security Deposits")}
    ${inp("remitMisc", "Funds Remitted — Misc Receipts")}
    <b>Closing Balance B</b><span><b>${fmt(c.closeB)}</b></span></div></div>
  <div class="card"><h2 style="margin-top:0">Section C — Superscribed Cheques</h2><div class="kv">
    ${inp("openC", "Opening Balance")}
    <b>SS Cheques Received (auto)</b><span>${fmt(c.ssRecv)}</span>
    <b>Closing Balance C</b><span><b>${fmt(c.closeC)}</b></span></div></div>
  <div class="card"><h2 style="margin-top:0">Section D — Assets Transferred to Region</h2><div class="kv">
    ${inp("openD", "Opening / Closing Balance")}
    <b>NET BALANCE (A+B+C+D)</b><span><b>${fmt(c.net)}</b></span></div>
  <div class="row"><button class="btn gold" id="printCA">Print Current Account Statement</button></div></div>`;
}
function bCurrent() {
  document.querySelectorAll(".ca-in").forEach((el) => el.onchange = async () => { M().ca[el.dataset.k] = num(el.value); await save(); render(); });
  document.getElementById("printCA").onclick = () => {
    const ca = M().ca; const c = caCalc();
    printDoc("Statement of Current Account with Director Accounts GEPCO", `<table>
    <tr><th>Section</th><th>Detail of Transactions</th><th class="num">Debit</th><th class="num">Credit</th></tr>
    <tr><td>A</td><td>Opening Balance</td><td class="num"></td><td class="num">${fmt(ca.openA)}</td></tr>
    <tr><td>A</td><td>Debit/Credit Advices Received in Month</td><td class="num">${fmt(ca.advRecvDr)}</td><td class="num">${fmt(ca.advRecvCr)}</td></tr>
    <tr><td>A</td><td>Debit Advices Issued in Month</td><td class="num">${fmt(c.drIssued)}</td><td class="num"></td></tr>
    <tr><td>A</td><td>Credit Advices Issued in Month</td><td class="num"></td><td class="num">${fmt(c.crIssued)}</td></tr>
    <tr class="total"><td>A</td><td>Closing Balance A</td><td colspan="2" class="num">${fmt(c.closeA)}</td></tr>
    <tr><td>B</td><td>Opening Balance</td><td class="num">${fmt(ca.openB)}</td><td class="num"></td></tr>
    <tr><td>B</td><td>Funds Received During Month</td><td class="num">${fmt(ca.fundsRecv)}</td><td class="num"></td></tr>
    <tr><td>B</td><td>Funds Remitted — Revenue Collections</td><td class="num"></td><td class="num">${fmt(ca.remitRev)}</td></tr>
    <tr><td>B</td><td>Funds Remitted — Security Deposits</td><td class="num"></td><td class="num">${fmt(ca.remitSec)}</td></tr>
    <tr class="total"><td>B</td><td>Closing Balance B</td><td colspan="2" class="num">${fmt(c.closeB)}</td></tr>
    <tr><td>C</td><td>Opening Balance (SS Cheques)</td><td class="num">${fmt(ca.openC)}</td><td class="num"></td></tr>
    <tr><td>C</td><td>SS Cheques Received (Form A-25)</td><td class="num">${fmt(c.ssRecv)}</td><td class="num"></td></tr>
    <tr class="total"><td>C</td><td>Closing Balance C</td><td colspan="2" class="num">${fmt(c.closeC)}</td></tr>
    <tr class="total"><td>D</td><td>Assets Transferred to Region</td><td colspan="2" class="num">${fmt(c.closeD)}</td></tr>
    <tr class="total"><td colspan="2">NET BALANCE IN OUR BOOKS (A+B+C+D)</td><td colspan="2" class="num">${fmt(c.net)}</td></tr></table>`);
  };
}

// ---------- Month / Year Close ----------
function vClose() {
  const t = computeTrial(S.currentMonth);
  const nm = nextMonth(S.currentMonth);
  const exists = !!S.months[nm];
  const opDr = t.rows.filter((r) => !r.bs).reduce((s, r) => s + r.closeDr, 0);
  const opCr = t.rows.filter((r) => !r.bs).reduce((s, r) => s + r.closeCr, 0);
  const surplus = opCr - opDr;
  const bsCodes = S.coa.filter((c) => c.bs);
  return `<h1>Month / Year Close — ${monthLabel(S.currentMonth)}</h1>
  <div class="sub">Normal month: saare Closing balances agle month ke Opening. Saal ke end (June ke baad): Balance Sheet carry forward, Operating zero.</div>
  <div class="card"><h2 style="margin-top:0">1) Normal Month Close → ${monthLabel(nm)}</h2>
  <p>Closing Dr ${fmt(t.tot.closeDr)} / Cr ${fmt(t.tot.closeCr)} agle month ke Opening ban jayenge. ${exists ? "<b>" + monthLabel(nm) + " pehle se bana hua hai.</b>" : ""}</p>
  <div class="row"><button class="btn gold" id="closeNormal" ${exists ? "disabled" : ""}>${monthLabel(nm)} banayein (Opening = Closing)</button>
  <button class="btn ghost" id="lockMonth">${locked() ? "Month Locked hai" : "Is month ko Lock (Close) karein"}</button>
  ${locked() ? '<button class="btn ghost" id="unlockMonth">Unlock karein</button>' : ""}</div></div>
  <div class="card"><h2 style="margin-top:0">2) Year-End Close (June ke baad) → ${monthLabel(nm)}</h2>
  <div class="kv">
    <b>Operating Closing Dr (Expenses)</b><span>${fmt(opDr)}</span>
    <b>Operating Closing Cr (Revenue)</b><span>${fmt(opCr)}</span>
    <b>Operating Surplus / (Deficit)</b><span><b>${fmt(surplus)}</b> ${surplus >= 0 ? "(Surplus)" : "(Deficit)"}</span>
    <b>Surplus/Deficit transfer code</b><span><select id="transferCode">${bsCodes.map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.desc)}</option>`).join("")}</select></span>
  </div>
  <p class="muted">Year-end par: Balance Sheet codes ke balances carry forward, Operating codes zero. Surplus/Deficit upar wale code mein transfer ho jayega (Surplus → Cr, Deficit → Dr).</p>
  <div class="row"><button class="btn gold" id="closeYear" ${exists ? "disabled" : ""}>Year-End Close karke ${monthLabel(nm)} banayein</button></div></div>
  <div class="card"><h2 style="margin-top:0">Checklist</h2>
  <div class="kv"><b>1</b><span>Summaries ka Dr−Cr difference dekha? (Checks page)</span>
  <b>2</b><span>Unmatched GL codes clear kiye?</span>
  <b>3</b><span>Saare JVs post ho gaye?</span>
  <b>4</b><span>Trial Balance print karke file mein lagayi?</span>
  <b>5</b><span>Backup JSON export kiya? (Backup page)</span></div></div>`;
}
function bClose() {
  const t = computeTrial(S.currentMonth); const nm = nextMonth(S.currentMonth);
  const cn = document.getElementById("closeNormal");
  if (cn) cn.onclick = async () => {
    const opening = {};
    t.rows.forEach((r) => (opening[r.code] = { dr: r.closeDr, cr: r.closeCr }));
    S.months[nm] = emptyMonth(opening);
    S.months[nm].ca = { ...M().ca, openA: caCalc().closeA, openB: caCalc().closeB, openC: caCalc().closeC, openD: caCalc().closeD, advRecvDr: 0, advRecvCr: 0, fundsRecv: 0, remitRev: 0, remitSec: 0, remitMisc: 0 };
    S.currentMonth = nm; await save(); toast(monthLabel(nm) + " ban gaya — Opening = pichhle Closing"); render();
  };
  const cy = document.getElementById("closeYear");
  if (cy) cy.onclick = async () => {
    const code = document.getElementById("transferCode").value;
    const opening = {};
    let opDr = 0, opCr = 0;
    t.rows.forEach((r) => {
      if (r.bs) opening[r.code] = { dr: r.closeDr, cr: r.closeCr };
      else { opening[r.code] = { dr: 0, cr: 0 }; opDr += r.closeDr; opCr += r.closeCr; }
    });
    const surplus = opCr - opDr;
    if (surplus >= 0) opening[code].cr += surplus; else opening[code].dr += -surplus;
    S.months[nm] = emptyMonth(opening);
    S.months[nm].ca = { ...M().ca, openA: caCalc().closeA, openB: caCalc().closeB, openC: caCalc().closeC, openD: caCalc().closeD, advRecvDr: 0, advRecvCr: 0, fundsRecv: 0, remitRev: 0, remitSec: 0, remitMisc: 0 };
    S.months[nm].jvs.push({ id: uid(), date: nm + "-01", narration: "Year-End: Operating Surplus/Deficit (" + fmt(surplus) + ") transfer to " + code + " — Opening mein shamil (record ke liye)", lines: [], posted: false });
    S.currentMonth = nm; await save(); toast("Year-End Close ho gaya — BS carry, Operating zero, Surplus/Deficit " + fmt(surplus) + " → " + code); render();
  };
  const lk = document.getElementById("lockMonth");
  if (lk) lk.onclick = async () => { M().status = "closed"; await save(); toast("Month lock ho gaya"); render(); };
  const ul = document.getElementById("unlockMonth");
  if (ul) ul.onclick = async () => { M().status = "open"; await save(); render(); };
}

// ---------- Checks ----------
function vChecks() {
  const t = computeTrial(S.currentMonth); const m = M();
  const unm = Object.entries(t.unmatched);
  const neg = t.rows.filter((r) => r.closeDr < -0.5 || r.closeCr < -0.5);
  const draftJVs = m.jvs.filter((j) => !j.posted);
  const unbalJVs = m.jvs.filter((j) => j.posted && Math.abs(j.lines.reduce((s, l) => s + num(l.dr), 0) - j.lines.reduce((s, l) => s + num(l.cr), 0)) > 0.5);
  const row = (label, val, ok, note) => `<tr><td>${label}</td><td class="num"><b>${val}</b></td><td>${ok ? '<span class="badge ok">OK</span>' : '<span class="badge bad">Check karein</span>'} ${esc(note || "")}</td></tr>`;
  return `<h1>Checks — ${monthLabel(S.currentMonth)}</h1><div class="sub">Month close se pehle ye sab dekhein.</div>
  <div class="table-wrap"><table><tr><th>Check</th><th class="num">Result</th><th>Status</th></tr>
  ${row("Summaries Total Dr", fmt(t.postTot.dr), true)}
  ${row("Summaries Total Cr", fmt(t.postTot.cr), true)}
  ${row("Summaries Difference (Dr−Cr)", fmt(t.postTot.dr - t.postTot.cr), Math.abs(t.postTot.dr - t.postTot.cr) < 0.5, "zero hona chahiye")}
  ${row("Trial Closing Difference", fmt(t.diff), Math.abs(t.diff) < 0.5, "Surplus/Deficit isi se aata hai")}
  ${row("Unmatched GL codes", unm.length, unm.length === 0, "COA mein add karein ya code theek karein")}
  ${row("Negative closing balances", neg.length, neg.length === 0, neg.map((r) => r.code).join(", "))}
  ${row("Draft JVs (unposted)", draftJVs.length, draftJVs.length === 0, "post ya delete karein")}
  ${row("Posted lekin unbalanced JVs", unbalJVs.length, unbalJVs.length === 0)}
  </table></div>
  ${unm.length ? `<div class="card"><h2 style="margin-top:0">Unmatched Codes (Trial mein shamil nahi)</h2>
  <table><tr><th>Code</th><th class="num">Dr</th><th class="num">Cr</th><th>Lines</th><th></th></tr>
  ${unm.map(([code, v]) => `<tr><td><b>${esc(code)}</b></td><td class="num">${fmt(v.dr)}</td><td class="num">${fmt(v.cr)}</td><td>${v.count}</td><td><button class="btn small" data-add-unm="${esc(code)}">COA mein add karein</button></td></tr>`).join("")}</table></div>` : ""}`;
}
function bChecks() {
  document.querySelectorAll("[data-add-unm]").forEach((b) => b.onclick = async () => {
    const code = b.dataset.addUnm;
    S.coa.push({ code, desc: "(description likhein — COA page se)", bs: "0123".includes(code[0]) });
    await save(); toast("Code COA mein add ho gaya: " + code); render();
  });
}

// ---------- Backup ----------
function vBackup() {
  return `<h1>Backup / Data</h1>
  <div class="sub">Database browser (IndexedDB) mein hai — isi computer/browser par rehta hai. Har month close par JSON backup lazmi lein.</div>
  <div class="card"><div class="row">
    <button class="btn gold" id="exportJson">Backup Download (JSON)</button>
    <label class="btn ghost" style="cursor:pointer">Backup Restore karein <input type="file" id="importJson" accept=".json" style="display:none"></label>
    <button class="btn danger" id="resetSeed">Reset — July 2026 seed dobara load karein</button>
  </div>
  <p class="muted">Restore karne se maujooda data backup wale data se replace ho jayega. Reset se saara data saaf hokar July 2026 ka asal data wapas aa jayega.</p></div>
  <div class="card"><h2 style="margin-top:0">Unit Settings</h2><div class="kv">
    <b>Unit Name</b><span><input id="setUnit" value="${esc(S.unit)}" style="width:300px"></span>
    <b>Unit Code</b><span><input id="setCode" value="${esc(S.unitCode)}" style="width:120px"></span>
  </div><div class="row"><button class="btn" id="saveSettings">Save Settings</button></div></div>`;
}
function bBackup() {
  document.getElementById("exportJson").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" }));
    a.download = "gepco-erp-backup-" + S.currentMonth + ".json"; a.click();
    toast("Backup download ho gaya");
  };
  document.getElementById("importJson").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.coa || !data.months) throw new Error("ye ERP backup file nahi lagti");
      if (!confirm("Restore karein? Maujooda data replace ho jayega.")) return;
      S = data; await save(); toast("Backup restore ho gaya"); render();
    } catch (err) { toast("Restore fail: " + err.message); }
  };
  document.getElementById("resetSeed").onclick = async () => {
    if (!confirm("Saara data saaf karke July 2026 seed dobara load karein?")) return;
    S = seedState(); await save(); toast("Reset ho gaya — July 2026 data load"); render();
  };
  document.getElementById("saveSettings").onclick = async () => {
    S.unit = document.getElementById("setUnit").value.trim() || S.unit;
    S.unitCode = document.getElementById("setCode").value.trim() || S.unitCode;
    await save(); toast("Settings save ho gayi"); render();
  };
}

// ---------- Init ----------
load().then(render).catch((e) => {
  document.getElementById("view").innerHTML = "<div class='card'><b>Load error:</b> " + esc(e.message) + "</div>";
});
