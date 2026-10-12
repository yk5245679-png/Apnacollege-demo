"use strict";
const $ = (id) => document.getElementById(id);
const fmt = (b) => (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB");
const toBlob = (c, type, q) => new Promise((ok) => c.toBlob(ok, type, q));
const loadImg = (file) => new Promise((ok, bad) => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { URL.revokeObjectURL(u); ok(i); };
    i.onerror = () => bad(new Error("Photo khul nahi paayi: " + file.name));
    i.src = u;
});
function save(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function setErr(id, t) { $(id).textContent = t || ""; $(id).hidden = !t; }

// ---------- navigation, clock ----------
const crumbs = { home: "Home", photo: "Photo Studio", resize: "Photo / Signature Resize", pdf: "Images to PDF", pdfx: "PDF Studio", register: "Daily Register", links: "Portals / Links" };
function show(v) {
    document.querySelectorAll(".view").forEach((x) => x.classList.toggle("active", x.id === v + "-view"));
    document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    $("crumb").textContent = crumbs[v]; window.scrollTo(0, 0);
    if (v === "register") renderReg();
}
document.querySelectorAll("[data-view],[data-go]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view || b.dataset.go)));
$("today").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();
const tick = () => { $("clock").textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); };
tick(); setInterval(tick, 20000);

// ---------- Photo Studio ----------
const SIZES = { passport: [35, 45], square: [50.8, 50.8], visa: [50.8, 50.8] };
const PAPER = { a4: [210, 297, "A4 sheet"], "4x6": [101.6, 152.4, "4 × 6 photo paper"] };
let src = null, sheet = null;
const dims = () => ($("photo-preset").value === "custom" ? [+$("custom-width").value, +$("custom-height").value] : SIZES[$("photo-preset").value]);
function layout() {
    const [w, h] = dims(), [pw, ph] = PAPER[$("paper-size").value];
    if (!(w > 0 && h > 0)) return { c: 0, r: 0, n: 0 };
    const c = Math.floor((pw - 10 + 2.5) / (w + 2.5)), r = Math.floor((ph - 10 + 2.5) / (h + 2.5));
    return { c, r, n: Math.max(0, c) * Math.max(0, r) };
}
function estimate() {
    const n = Math.max(1, +$("copies").value || 1);
    $("pv-count").textContent = `${n} photo · ek sheet me ${layout().n} aati hain`;
    $("pv-paper").textContent = PAPER[$("paper-size").value][2];
    $("paper-preview").classList.toggle("p46", $("paper-size").value === "4x6");
}
function resetSheet() {
    sheet = null; $("download-button").disabled = $("print-button").disabled = true;
    const c = $("paper-preview").querySelector("canvas"); if (c) c.remove();
    $("ph").hidden = false; setErr("photo-error"); estimate();
}
async function pickPhoto(file) {
    resetSheet();
    if (!file) return;
    try {
        if (!file.type.startsWith("image/")) throw new Error("Sirf photo (JPG, PNG, WEBP) chunein.");
        src = await loadImg(file);
        $("file-name").textContent = file.name; $("file-size").textContent = `${src.naturalWidth} × ${src.naturalHeight} px · ${fmt(file.size)}`;
        $("selected-file").hidden = false; $("upload-zone").hidden = true;
    } catch (e) { src = null; $("selected-file").hidden = true; $("upload-zone").hidden = false; setErr("photo-error", e.message); }
}
function drawSheet() {
    const [w, h] = dims(), [pw, ph] = PAPER[$("paper-size").value], dpi = +$("dpi").value, copies = +$("copies").value, L = layout();
    if (!src) throw new Error("Pehle photo chunein.");
    if (!(w >= 5 && h >= 5 && w <= 100 && h <= 150)) throw new Error("Size 5-100 mm chaudai aur 5-150 mm lambai ke beech rakhein.");
    if (!Number.isInteger(copies) || copies < 1 || copies > 100) throw new Error("Copies 1 se 100 ke beech rakhein.");
    if (L.n < 1) throw new Error("Ye size is paper par nahi aata.");
    if (copies > L.n) throw new Error(`Is paper par sirf ${L.n} photo aati hain. Copies kam karein ya bada paper chunein.`);
    const k = dpi / 25.4, c = document.createElement("canvas");
    c.width = Math.round(pw * k); c.height = Math.round(ph * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    const W = Math.round(w * k), H = Math.round(h * k), gap = Math.round(2.5 * k);
    const x0 = Math.max(Math.round(5 * k), Math.floor((c.width - (L.c * W + (L.c - 1) * gap)) / 2));
    const y0 = Math.max(Math.round(5 * k), Math.floor((c.height - (L.r * H + (L.r - 1) * gap)) / 2));
    const asp = w / h, sa = src.naturalWidth / src.naturalHeight;
    let sw = src.naturalWidth, sh = src.naturalHeight, sx = 0, sy = 0;
    if (sa > asp) { sw = sh * asp; sx = (src.naturalWidth - sw) / 2; } else { sh = sw / asp; sy = (src.naturalHeight - sh) / 2; }
    g.strokeStyle = "#dfe3ea"; g.lineWidth = Math.max(1, dpi / 300);
    for (let i = 0; i < copies; i++) {
        const x = x0 + (i % L.c) * (W + gap), y = y0 + Math.floor(i / L.c) * (H + gap);
        g.drawImage(src, sx, sy, sw, sh, x, y, W, H); g.strokeRect(x, y, W, H);
    }
    return c;
}
$("photo-file").addEventListener("change", () => pickPhoto($("photo-file").files[0]));
$("remove-file").addEventListener("click", () => { src = null; $("photo-file").value = ""; $("selected-file").hidden = true; $("upload-zone").hidden = false; resetSheet(); });
$("upload-zone").addEventListener("dragover", (e) => { e.preventDefault(); $("upload-zone").classList.add("dragging"); });
$("upload-zone").addEventListener("dragleave", () => $("upload-zone").classList.remove("dragging"));
$("upload-zone").addEventListener("drop", (e) => { e.preventDefault(); $("upload-zone").classList.remove("dragging"); if (e.dataTransfer.files[0]) { $("photo-file").files = e.dataTransfer.files; pickPhoto(e.dataTransfer.files[0]); } });
$("photo-preset").addEventListener("change", () => { $("custom-fields").hidden = $("photo-preset").value !== "custom"; resetSheet(); });
["paper-size", "copies", "dpi", "custom-width", "custom-height"].forEach((id) => { $(id).addEventListener("change", resetSheet); $(id).addEventListener("input", resetSheet); });
$("generate-button").addEventListener("click", () => {
    try {
        setErr("photo-error"); sheet = drawSheet();
        const old = $("paper-preview").querySelector("canvas"); if (old) old.remove();
        $("ph").hidden = true; $("paper-preview").appendChild(sheet); $("paper-preview").classList.toggle("p46", $("paper-size").value === "4x6");
        $("download-button").disabled = $("print-button").disabled = false;
    } catch (e) { setErr("photo-error", e.message); }
});
$("download-button").addEventListener("click", async () => { if (sheet) save(await toBlob(sheet, "image/png"), `photo-sheet-${$("paper-size").value}.png`); });
$("print-button").addEventListener("click", () => {
    if (!sheet) return;
    const [pw, ph] = PAPER[$("paper-size").value], win = window.open("", "_blank");
    if (!win) { setErr("photo-error", "Browser ne print window roki. Pop-up allow karke dobara try karein."); return; }
    win.opener = null;
    win.document.open();
    win.document.write(`<!doctype html><html><head><title>Photo sheet</title><style>@page{size:${pw}mm ${ph}mm;margin:0}*{box-sizing:border-box}html,body{width:${pw}mm;height:${ph}mm;margin:0}img{display:block;width:100%;height:100%}</style></head><body><img id="p" alt=""></body></html>`);
    const im = win.document.getElementById("p");
    im.addEventListener("load", () => { win.focus(); win.print(); }, { once: true });
    im.src = sheet.toDataURL("image/png"); win.document.close();
});

// ---------- Resize to size / KB ----------
let rzImg = null, rzBlob = null, rzName = "photo";
$("rz-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { rzImg = await loadImg(f); rzName = f.name.replace(/\.[^.]+$/, ""); $("rz-info").textContent = `${f.name} · ${rzImg.naturalWidth}×${rzImg.naturalHeight}px · ${fmt(f.size)}`; setErr("rz-err"); }
    catch (x) { rzImg = null; setErr("rz-err", x.message); }
});
document.querySelectorAll("[data-rz]").forEach((b) => b.addEventListener("click", () => { [$("rz-w").value, $("rz-h").value, $("rz-kb").value] = b.dataset.rz.split(","); }));
$("rz-go").addEventListener("click", async () => {
    setErr("rz-err"); $("rz-result").hidden = true;
    if (!rzImg) return setErr("rz-err", "Pehle photo ya signature chunein.");
    const w = Math.round(+$("rz-w").value) || rzImg.naturalWidth, h = Math.round(+$("rz-h").value) || rzImg.naturalHeight, max = (+$("rz-kb").value || 0) * 1024;
    if (w < 10 || h < 10 || w > 6000 || h > 6000) return setErr("rz-err", "Width aur height 10 se 6000 px ke beech rakhein.");
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), a = w / h, sa = rzImg.naturalWidth / rzImg.naturalHeight;
    let sw = rzImg.naturalWidth, sh = rzImg.naturalHeight, sx = 0, sy = 0;
    if (sa > a) { sw = sh * a; sx = (rzImg.naturalWidth - sw) / 2; } else { sh = sw / a; sy = (rzImg.naturalHeight - sh) / 2; }
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = "high"; g.drawImage(rzImg, sx, sy, sw, sh, 0, 0, w, h);
    let blob = await toBlob(c, "image/jpeg", 0.95);
    if (max && blob.size > max) {
        let lo = 0.03, hi = 0.95, best = await toBlob(c, "image/jpeg", lo);
        if (best.size > max) return setErr("rz-err", `Itne chhote size (${w}×${h}) me bhi ${fmt(best.size)} se kam nahi ho paa raha. KB badhayein ya size chhota karein.`);
        for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2, b = await toBlob(c, "image/jpeg", m); if (b.size <= max) { lo = m; best = b; } else hi = m; }
        blob = best;
    }
    rzBlob = blob; $("rz-img").src = URL.createObjectURL(blob); $("rz-meta").textContent = `${w} × ${h} px · ${fmt(blob.size)}`; $("rz-result").hidden = false;
});
$("rz-save").addEventListener("click", () => rzBlob && save(rzBlob, `${rzName}-resized.jpg`));

// ---------- Images to PDF ----------
let pdfItems = [];
function drawList() {
    $("pdf-go").disabled = !pdfItems.length;
    $("pdf-list").innerHTML = "";
    pdfItems.forEach((it, i) => {
        const row = document.createElement("div"); row.className = "prow";
        const im = document.createElement("img"); im.src = it.thumb; const nm = document.createElement("span"); nm.textContent = `${i + 1}. ${it.name}`;
        row.append(im, nm);
        [["↑", -1], ["↓", 1], ["×", 0]].forEach(([t, d]) => {
            const b = document.createElement("button"); b.textContent = t;
            b.onclick = () => { if (!d) pdfItems.splice(i, 1); else if (pdfItems[i + d]) [pdfItems[i], pdfItems[i + d]] = [pdfItems[i + d], pdfItems[i]]; drawList(); };
            row.append(b);
        });
        $("pdf-list").append(row);
    });
}
$("pdf-files").addEventListener("change", async (e) => {
    setErr("pdf-err");
    for (const f of e.target.files) {
        try { const img = await loadImg(f); pdfItems.push({ name: f.name, img, thumb: URL.createObjectURL(f) }); } catch (x) { setErr("pdf-err", x.message); }
    }
    e.target.value = ""; drawList();
});
async function jpegBytes(img) {
    const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { bytes: new Uint8Array(await (await toBlob(c, "image/jpeg", 0.9)).arrayBuffer()), w: c.width, h: c.height };
}
function buildPdf(pages) { // minimal PDF writer: one JPEG image per page
    const enc = new TextEncoder(), parts = [], off = []; let len = 0;
    const put = (d) => { const b = typeof d === "string" ? enc.encode(d) : d; parts.push(b); len += b.length; };
    const obj = (n, body) => { off[n] = len; put(`${n} 0 obj\n`); put(body); put("\nendobj\n"); };
    put("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] >>`);
    pages.forEach((p, i) => {
        const pg = 3 + 3 * i, ct = pg + 1, im = pg + 2, content = `q ${p.dw.toFixed(2)} 0 0 ${p.dh.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)} cm /Im0 Do Q`;
        obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pw.toFixed(2)} ${p.ph.toFixed(2)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
        obj(ct, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        off[im] = len; put(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
        put(p.bytes); put("\nendstream\nendobj\n");
    });
    const n = 3 + 3 * pages.length, xref = len;
    put(`xref\n0 ${n}\n0000000000 65535 f \n` + off.slice(1, n).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join(""));
    put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: "application/pdf" });
}
$("pdf-go").addEventListener("click", async () => {
    setErr("pdf-err"); $("pdf-go").disabled = true; $("pdf-go").textContent = "Ban raha hai...";
    try {
        const pages = [];
        for (const it of pdfItems) {
            const j = await jpegBytes(it.img); let pw = 595.28, ph = 841.89, dw, dh;
            if ($("pdf-page").value === "orig") { pw = j.w * 0.75; ph = j.h * 0.75; dw = pw; dh = ph; }
            else { const s = Math.min((pw - 56.7) / j.w, (ph - 56.7) / j.h); dw = j.w * s; dh = j.h * s; }
            pages.push({ ...j, pw, ph, dw, dh, x: (pw - dw) / 2, y: (ph - dh) / 2 });
        }
        save(buildPdf(pages), (($("pdf-name").value || "documents").replace(/[^\w .-]/g, "") || "documents") + ".pdf");
    } catch (e) { setErr("pdf-err", "PDF nahi ban paayi: " + e.message); }
    $("pdf-go").textContent = "📄 PDF banayein"; $("pdf-go").disabled = !pdfItems.length;
});

// ---------- Daily register (mobile, baaki, receipt, backup) ----------
const KEY = "csc.register";
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let reg = []; try { reg = JSON.parse(localStorage.getItem(KEY)) || []; } catch { reg = []; }
let shop = "CSC Center"; fetch("/api/shop").then((r) => r.json()).then((d) => { shop = d.shopName || shop; }).catch(() => {});
const saveReg = () => { try { localStorage.setItem(KEY, JSON.stringify(reg)); } catch { /* ignore */ } };
const isToday = (e) => new Date(e.t).toDateString() === new Date().toDateString();
const paidOf = (e) => (e.paid == null ? e.amt : e.paid);
const dueOf = (e) => Math.max(0, e.amt - paidOf(e));
function totals() {
    const t = reg.filter(isToday), sum = (list, f) => list.reduce((s, e) => s + f(e), 0);
    return { list: t, all: sum(t, (e) => e.amt), got: sum(t, paidOf), cash: sum(t.filter((e) => e.mode === "Cash"), paidOf), upi: sum(t.filter((e) => e.mode === "UPI"), paidOf), due: sum(t, dueOf), dueAll: sum(reg, dueOf) };
}
function updateStats() {
    const t = totals();
    $("st-cust").textContent = t.list.length; $("st-money").textContent = "₹" + t.got; $("st-split").textContent = `₹${t.cash} / ₹${t.upi}`;
}
function receipt(e) {
    const w = window.open("", "_blank");
    if (!w) return alert("Browser ne pop-up roka. Pop-up allow karein.");
    w.opener = null;
    const row = (a, b) => `<div class="r"><span>${a}</span><span>${b}</span></div>`, d = dueOf(e);
    w.document.write(`<!doctype html><html><head><title>Receipt</title><style>@page{size:80mm auto;margin:3mm}body{font:12px monospace;width:74mm;margin:0}h2{text-align:center;margin:4px 0}.r{display:flex;justify-content:space-between;gap:8px}hr{border:0;border-top:1px dashed #000}.c{text-align:center}</style></head><body><h2>${esc(shop)}</h2><div class="c">${new Date(e.t).toLocaleString("en-IN")}</div><hr>${row("Customer", esc(e.who || "-"))}${e.mobile ? row("Mobile", esc(e.mobile)) : ""}${row("Service", esc(e.svc || "-"))}<hr>${row("Total", "Rs " + e.amt)}${row("Mila", "Rs " + paidOf(e))}${d ? row("Baaki", "Rs " + d) : ""}<hr><div class="c">Dhanyavaad!</div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
}
function showBackup() {
    let last = 0; try { last = +localStorage.getItem("csc.lastBackup") || 0; } catch { /* ignore */ }
    $("rg-bk").textContent = last ? "Aakhri backup: " + new Date(last).toLocaleString("en-IN") : "⚠️ Abhi tak backup nahi liya. Roz ek baar 'Backup file' save karke pen drive ya Google Drive me rakhein.";
}
function renderReg() {
    const t = totals();
    $("rg-tot").innerHTML = `<span>Customer: ${t.list.length}</span><span>Bill: ₹${t.all}</span><span>Mila: ₹${t.got}</span><span>Cash: ₹${t.cash}</span><span>UPI: ₹${t.upi}</span><span class="due">Aaj ka baaki: ₹${t.due}</span><span class="due">Kul baaki: ₹${t.dueAll}</span>`;
    $("rg-body").innerHTML = "";
    t.list.slice().reverse().forEach((e) => {
        const tr = document.createElement("tr"), d = dueOf(e);
        const cell = (v) => { const td = document.createElement("td"); td.textContent = v; tr.append(td); return td; };
        cell(new Date(e.t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        cell((e.who || "-") + (e.mobile ? ` · ${e.mobile}` : "")); cell(e.svc || "-"); cell("₹" + e.amt);
        const dc = cell(d ? "₹" + d : "-"); if (d) { dc.className = "due"; const m = document.createElement("button"); m.className = "mini"; m.textContent = "Mila"; m.onclick = () => { e.paid = e.amt; saveReg(); renderReg(); }; dc.append(m); }
        cell(e.mode);
        const td = document.createElement("td"), r = document.createElement("button"), x = document.createElement("button");
        r.textContent = "🧾"; r.title = "Receipt"; r.onclick = () => receipt(e);
        x.textContent = "🗑"; x.title = "Hatayein"; x.onclick = () => { if (confirm("Ye entry hatayein?")) { reg = reg.filter((y) => y.id !== e.id); saveReg(); renderReg(); } };
        td.append(r, x); tr.append(td); $("rg-body").append(tr);
    });
    showBackup(); updateStats();
}
function addEntry(e) { reg.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), t: Date.now(), ...e }); saveReg(); renderReg(); }
$("rg-add").addEventListener("click", () => {
    const amt = Math.max(0, Math.round(+$("rg-amt").value || 0)), got = $("rg-got").value === "" ? amt : Math.min(amt, Math.max(0, Math.round(+$("rg-got").value || 0)));
    if (!$("rg-svc").value.trim() && !amt) return;
    addEntry({ who: $("rg-who").value.trim(), mobile: $("rg-mob").value.trim(), svc: $("rg-svc").value.trim(), amt, paid: got, mode: $("rg-mode").value });
    ["rg-who", "rg-mob", "rg-svc", "rg-amt", "rg-got"].forEach((id) => { $(id).value = ""; });
});
$("rg-csv").addEventListener("click", () => {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = [["Date", "Time", "Customer", "Mobile", "Service", "Total", "Mila", "Baaki", "Mode"], ...reg.map((e) => [new Date(e.t).toLocaleDateString("en-IN"), new Date(e.t).toLocaleTimeString("en-IN"), e.who, e.mobile, e.svc, e.amt, paidOf(e), dueOf(e), e.mode])];
    save(new Blob(["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }), "csc-register.csv");
});
$("rg-backup").addEventListener("click", () => {
    save(new Blob([JSON.stringify({ v: 2, reg })], { type: "application/json" }), `csc-backup-${new Date().toISOString().slice(0, 10)}.json`);
    try { localStorage.setItem("csc.lastBackup", String(Date.now())); } catch { /* ignore */ } showBackup();
});
$("rg-restore").addEventListener("change", async (ev) => {
    try {
        const d = JSON.parse(await ev.target.files[0].text()), ids = new Set(reg.map((x) => x.id)); let n = 0;
        (d.reg || []).forEach((x) => { if (x && x.id && typeof x.amt === "number" && typeof x.t === "number" && !ids.has(x.id)) { reg.push(x); n++; } });
        saveReg(); renderReg(); alert(n + " entry wapas aayi.");
    } catch { alert("Ye backup file sahi nahi hai."); }
    ev.target.value = "";
});
window.addEventListener("csc:printed", (ev) => { // customer's QR job was printed: log it automatically
    const j = ev.detail; if (reg.some((r) => r.ref === j.id)) return;
    reg.push({ id: "q" + j.id, ref: j.id, t: Date.now(), who: "Token #" + j.token, svc: "Passport photo", amt: Number(j.amount) || 0, paid: Number(j.amount) || 0, mode: "UPI" });
    saveReg(); renderReg();
});

// ---------- PDF Studio: merge / compress to KB / PDF to JPG (engines load only when used) ----------
let pxItems = [], pdfjsLib = null;
const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("PDF engine load nahi hua")); document.head.append(s); });
async function getPdfLib() { if (!window.PDFLib) await loadScript("lib/pdf-lib.min.js"); return window.PDFLib; }
async function getPdfjs() { if (!pdfjsLib) { pdfjsLib = await import("./lib/pdf.min.mjs"); pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.mjs"; } return pdfjsLib; }
async function renderPages(file, longSide) {
    const lib = await getPdfjs(), doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, out = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: longSide / Math.max(v1.width, v1.height) });
        const c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvas: c, canvasContext: g, viewport: v }).promise; out.push({ c, pw: v1.width, ph: v1.height });
    }
    return out;
}
function drawPx() {
    $("px-go").disabled = !pxItems.length; $("px-list").innerHTML = "";
    pxItems.forEach((it, i) => {
        const row = document.createElement("div"); row.className = "prow";
        const nm = document.createElement("span"); nm.textContent = `${i + 1}. ${it.name} (${fmt(it.file.size)})`; row.append(nm);
        [["↑", -1], ["↓", 1], ["×", 0]].forEach(([t, d]) => {
            const b = document.createElement("button"); b.textContent = t;
            b.onclick = () => { if (!d) pxItems.splice(i, 1); else if (pxItems[i + d]) [pxItems[i], pxItems[i + d]] = [pxItems[i + d], pxItems[i]]; drawPx(); };
            row.append(b);
        });
        $("px-list").append(row);
    });
}
$("px-mode").addEventListener("change", () => { $("px-kbwrap").hidden = $("px-mode").value !== "compress"; });
$("px-files").addEventListener("change", (e) => {
    for (const f of e.target.files) if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) pxItems.push({ name: f.name, file: f });
    e.target.value = ""; drawPx();
});
$("px-go").addEventListener("click", async () => {
    setErr("px-err"); $("px-ok").hidden = true;
    const mode = $("px-mode").value, btn = $("px-go"), label = btn.textContent, notes = [];
    btn.disabled = true; btn.textContent = "Chal raha hai...";
    try {
        if (mode === "merge") {
            if (pxItems.length < 2) throw new Error("Jodne ke liye kam se kam 2 PDF chunein.");
            const L = await getPdfLib(), out = await L.PDFDocument.create();
            for (const it of pxItems) { const d = await L.PDFDocument.load(await it.file.arrayBuffer()); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); }
            const b = new Blob([await out.save()], { type: "application/pdf" }); save(b, "merged.pdf"); notes.push(`merged.pdf · ${out.getPageCount()} page · ${fmt(b.size)}`);
        } else if (mode === "compress") {
            const max = (+$("px-kb").value || 0) * 1024; if (max < 10240) throw new Error("Max size kam se kam 10 KB rakhein.");
            for (const it of pxItems) {
                if (it.file.size <= max) { notes.push(`${it.name}: pehle se ${fmt(it.file.size)} hai, badlav nahi kiya.`); continue; }
                let best = null, side = 1700;
                for (let n = 0; n < 4 && !best; n++) {
                    const pages = await renderPages(it.file, side);
                    const enc = (q) => Promise.all(pages.map(async (p) => ({ ...p, bytes: new Uint8Array(await (await toBlob(p.c, "image/jpeg", q)).arrayBuffer()) })));
                    const size = (a) => a.reduce((s, p) => s + p.bytes.length, 0) + 700 * a.length;
                    let lo = 0.25, hi = 0.9, pick = await enc(lo);
                    if (size(pick) <= max) { for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2, t = await enc(m); if (size(t) <= max) { lo = m; pick = t; } else hi = m; } best = pick; } else side = Math.round(side * 0.75);
                }
                if (!best) throw new Error(`${it.name}: ${fmt(max)} me nahi aa paa raha. KB badhayein.`);
                const blob = buildPdf(best.map((p) => ({ bytes: p.bytes, w: p.c.width, h: p.c.height, pw: p.pw, ph: p.ph, dw: p.pw, dh: p.ph, x: 0, y: 0 })));
                save(blob, it.name.replace(/\.pdf$/i, "") + "-small.pdf"); notes.push(`${it.name}: ${fmt(it.file.size)} → ${fmt(blob.size)}`);
            }
        } else {
            for (const it of pxItems) {
                const pages = await renderPages(it.file, 2200);
                for (let i = 0; i < pages.length; i++) save(await toBlob(pages[i].c, "image/jpeg", 0.92), `${it.name.replace(/\.pdf$/i, "")}-page${i + 1}.jpg`);
                notes.push(`${it.name}: ${pages.length} JPG`);
            }
        }
        $("px-ok").textContent = "✅ " + notes.join(" | "); $("px-ok").hidden = false;
    } catch (e) { setErr("px-err", /password/i.test(e.name + e.message) ? "Ye PDF password se locked hai. Pehle unlock karein." : "Nahi ho paaya: " + e.message); }
    btn.textContent = label; btn.disabled = !pxItems.length;
});

// ---------- Portals / links ----------
const LINKS = [["CSC Digital Seva", "https://digitalseva.csc.gov.in"], ["Aadhaar (myAadhaar)", "https://myaadhaar.uidai.gov.in"], ["DigiLocker", "https://www.digilocker.gov.in"], ["Income Tax / PAN", "https://www.incometax.gov.in"], ["UMANG", "https://web.umang.gov.in"], ["e-Shram", "https://eshram.gov.in"], ["PM-Kisan", "https://pmkisan.gov.in"], ["Voter Services", "https://voters.eci.gov.in"], ["Parivahan (DL / RC)", "https://parivahan.gov.in"], ["Passport Seva", "https://www.passportindia.gov.in"], ["EPFO", "https://www.epfindia.gov.in"]];
let myLinks = []; try { myLinks = JSON.parse(localStorage.getItem("csc.links")) || []; } catch { myLinks = []; }
function drawLinks() {
    $("ln-grid").innerHTML = "";
    [...LINKS.map(([n, u]) => ({ n, u })), ...myLinks.map((l, i) => ({ ...l, i }))].forEach((l) => {
        const a = document.createElement("a"); a.className = "lnk"; a.href = l.u; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = l.n;
        if (l.i != null) { const x = document.createElement("button"); x.textContent = "×"; x.title = "Hatayein"; x.onclick = (ev) => { ev.preventDefault(); myLinks.splice(l.i, 1); try { localStorage.setItem("csc.links", JSON.stringify(myLinks)); } catch { /* ignore */ } drawLinks(); }; a.append(x); }
        $("ln-grid").append(a);
    });
}
$("ln-add").addEventListener("click", () => {
    const n = $("ln-name").value.trim(); let u = $("ln-url").value.trim(); if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    if (!n || !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u)) return alert("Naam aur sahi website address daalein.");
    myLinks.push({ n, u }); try { localStorage.setItem("csc.links", JSON.stringify(myLinks)); } catch { /* ignore */ } $("ln-name").value = $("ln-url").value = ""; drawLinks();
});
drawLinks();
async function pollWaiting() {
    try { const r = await fetch("/api/incoming", { cache: "no-store" }); if (r.ok) $("st-wait").textContent = (await r.json()).filter((j) => !j.done).length; } catch { /* server off */ }
}
estimate(); updateStats(); pollWaiting(); setInterval(pollWaiting, 5000);
