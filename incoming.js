"use strict";
// Add-on for the Photo Studio. Loaded automatically by server.js (after app.js); app.js is not modified.
(() => {
    const $ = (id) => document.getElementById(id);
    const studio = document.querySelector("#photo-view .studio-layout");
    if (!studio) return;
    const fileInput = $("photo-file"), presetSelect = $("photo-preset"), copiesInput = $("copies"), selectedFile = $("selected-file");
    const generateButton = $("generate-button"), printButton = $("print-button"), errorBox = $("photo-error");
    const SIZES = { passport: [35, 45], square: [50.8, 50.8], visa: [50.8, 50.8] };
    const baseTitle = document.title;
    let jobs = [], lastSig = "", activeId = null, internal = false;

    const store = {
        get(k, d) { try { const v = localStorage.getItem("csc." + k); return v === null ? d : v === "1"; } catch { return d; } },
        set(k, v) { try { localStorage.setItem("csc." + k, v ? "1" : "0"); } catch { /* ignore */ } }
    };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    const showErr = (t) => { errorBox.textContent = t; errorBox.hidden = false; };
    const api = (id, method, body) => fetch(`/api/incoming/${id}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => {});
    async function waitFor(test, ms = 8000) { const end = Date.now() + ms; while (!test()) { if (Date.now() > end) throw new Error("photo load nahi hui"); await sleep(50); } }

    // ---------- UI ----------
    const card = document.createElement("section");
    card.className = "content-card inbox-card";
    card.innerHTML = `
        <div class="section-heading"><div><h2>Customer uploads</h2><p>Customer QR scan karke photo bhejega, wo yahan aayegi</p></div><span class="step-chip" id="inbox-count">0 WAITING</span></div>
        <div class="inbox-body">
            <div class="inbox-qr"><canvas id="qr-canvas" width="1" height="1"></canvas><small id="qr-url">QR load ho raha hai...</small></div>
            <div class="inbox-main">
                <div class="inbox-options">
                    <label><input type="checkbox" id="opt-face"> Face centre crop</label>
                    <label><input type="checkbox" id="opt-bg"> White background</label>
                    <label><input type="checkbox" id="opt-pay"> Print se pehle payment</label>
                    <label>Face zoom <select id="opt-zoom"><option value="2.2">Close</option><option value="2.7">Medium</option><option value="3.2">Wide</option></select></label>
                </div>
                <div class="inbox-list" id="inbox-list"></div>
            </div>
        </div>`;
    studio.parentNode.insertBefore(card, studio);
    [["opt-face", "face", true], ["opt-bg", "bg", true], ["opt-pay", "pay", true]].forEach(([id, key, def]) => {
        $(id).checked = store.get(key, def);
        $(id).addEventListener("change", () => store.set(key, $(id).checked));
    });

    $("opt-zoom").value = "2.7";
    try { const z = localStorage.getItem("csc.zoom"); if (z) $("opt-zoom").value = z; } catch { /* ignore */ }
    $("opt-zoom").addEventListener("change", () => { try { localStorage.setItem("csc.zoom", $("opt-zoom").value); } catch { /* ignore */ } });

    function render() {
        $("inbox-count").textContent = `${jobs.filter((j) => !j.done).length} WAITING`;
        $("inbox-list").innerHTML = jobs.length ? jobs.map((j) => {
            const t = new Date(j.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return `<div class="job${j.done ? " job-done" : ""}" data-id="${j.id}">
                <img class="job-thumb" src="/api/incoming/${j.id}/photo" alt="">
                <div class="job-info"><strong>#${j.token} · ${esc(j.name)}</strong><small>${esc(j.preset)} · ${j.copies} copies${j.amount ? " · ₹" + Number(j.amount) : ""} · ${t}${j.done ? " · done" : ""}</small></div>
                <button class="chip${j.paid ? " chip-paid" : ""}" data-act="paid">${j.paid ? "₹ Paid" : "Unpaid"}</button>
                <button class="button button-secondary" data-act="open">Open</button>
                <button class="button button-primary" data-act="print">Print</button>
                <button class="remove-file" data-act="del" aria-label="Delete">×</button></div>`;
        }).join("") : '<p class="inbox-empty">Abhi koi photo nahi aayi. Customer ko QR scan karwayein.</p>';
    }
    async function poll() {
        try {
            const r = await fetch("/api/incoming", { cache: "no-store" });
            if (!r.ok) return;
            const data = await r.json(), sig = JSON.stringify(data);
            if (sig === lastSig) return;
            lastSig = sig; jobs = data; render();
            const waiting = jobs.filter((j) => !j.done).length;
            document.title = (waiting ? `(${waiting}) ` : "") + baseTitle;
        } catch { /* server not running */ }
    }
    async function drawQr() {
        try {
            const d = await (await fetch("/api/qr")).json();
            const px = Math.max(3, Math.floor(168 / (d.n + 4))), size = (d.n + 4) * px, c = $("qr-canvas"), g = c.getContext("2d");
            c.width = c.height = size; g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#111";
            d.rows.forEach((row, y) => [...row].forEach((v, x) => { if (v === "1") g.fillRect((x + 2) * px, (y + 2) * px, px, px); }));
            $("qr-url").textContent = d.url;
        } catch { $("qr-url").textContent = "QR ke liye 'start.bat' se chalayein (Live Server se nahi)."; }
    }

    // ---------- face centring ----------
    let detectorPromise;
    function getDetector() {
        return (detectorPromise ||= (async () => {
            if ("FaceDetector" in window) {
                try { const d = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
                    return { detect: async (i) => (await d.detect(i)).map((f) => ({ x: f.boundingBox.x, y: f.boundingBox.y, w: f.boundingBox.width, h: f.boundingBox.height })) }; } catch { /* next */ }
            }
            try { // needs internet the first time; the browser caches it afterwards
                const M = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
                const { FaceDetector, FilesetResolver } = await import(M + "/vision_bundle.mjs");
                const det = await FaceDetector.createFromOptions(await FilesetResolver.forVisionTasks(M + "/wasm"), {
                    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
                    runningMode: "IMAGE" });
                return { detect: async (i) => det.detect(i).detections.filter((x) => x.boundingBox).map((x) => ({ x: x.boundingBox.originX, y: x.boundingBox.originY, w: x.boundingBox.width, h: x.boundingBox.height })) };
            } catch { return null; }
        })());
    }
    async function findFace(img) {
        const d = await getDetector();
        if (!d) return null;
        try { return (await d.detect(img)).sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; } catch { return null; }
    }

    // ---------- white background (plain-wall photos) ----------
    function whiten(g, w, h) {
        const id = g.getImageData(0, 0, w, h), p = id.data, n = w * h;
        const R = [], G = [], B = [], t = Math.max(2, Math.round(w * 0.01)), lim = Math.round(h * 0.6);
        const add = (x, y) => { const i = (y * w + x) * 4; R.push(p[i]); G.push(p[i + 1]); B.push(p[i + 2]); };
        for (let x = 0; x < w; x += 2) for (let y = 0; y < t; y++) add(x, y);
        for (let y = 0; y < lim; y += 2) for (let x = 0; x < t; x++) { add(x, y); add(w - 1 - x, y); }
        const med = (a) => a.sort((x, y) => x - y)[a.length >> 1], bg = [med(R), med(G), med(B)], tol = 40 * 40;
        const near = (i) => { const a = p[i] - bg[0], b = p[i + 1] - bg[1], c = p[i + 2] - bg[2]; return a * a + b * b + c * c <= tol; };
        const m = new Uint8Array(n), q = new Int32Array(n); let qh = 0, qt = 0;
        const push = (x, y) => { const k = y * w + x; if (!m[k] && near(k * 4)) { m[k] = 1; q[qt++] = k; } };
        for (let x = 0; x < w; x++) push(x, 0);
        for (let y = 0; y < lim; y++) { push(0, y); push(w - 1, y); }
        while (qh < qt) { const k = q[qh++], x = k % w, y = (k - x) / w; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
        const share = qt / n;
        if (share < 0.05 || share > 0.8) return false; // not a plain wall: leave the photo untouched
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += m[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)];
            const a = Math.min(1, s / 5);
            if (a > 0) { const i = (y * w + x) * 4; p[i] += (255 - p[i]) * a; p[i + 1] += (255 - p[i + 1]) * a; p[i + 2] += (255 - p[i + 2]) * a; }
        }
        g.putImageData(id, 0, 0);
        return true;
    }

    // ---------- crop to the selected size ----------
    const loadImg = (b) => new Promise((ok, bad) => {
        const u = URL.createObjectURL(b), i = new Image();
        i.onload = () => { URL.revokeObjectURL(u); ok(i); };
        i.onerror = () => bad(new Error("photo khul nahi paayi"));
        i.src = u;
    });
    async function prepare(blob, aspect, job) {
        const img = await loadImg(blob), W = img.naturalWidth, H = img.naturalHeight;
        const face = $("opt-face").checked ? await findFace(img) : null;
        let cw, ch, cx, cy;
        if (face) { // zoom = photo height as a multiple of the face box (bigger number = more zoomed out)
            const k = Number($("opt-zoom").value) || 2.7, mx = face.x + face.w / 2, fy = face.y + face.h / 2;
            ch = k * face.h; cw = ch * aspect;
            const s = Math.min(1, W / cw, H / ch); cw *= s; ch *= s; // a very tight selfie can only zoom out as far as the photo allows
            cx = clamp(mx - cw / 2, 0, W - cw); cy = clamp(fy - 0.45 * ch, 0, H - ch);
        } else if (W / H > aspect) { ch = H; cw = H * aspect; cx = (W - cw) / 2; cy = 0; }
        else { cw = W; ch = W / aspect; cx = 0; cy = (H - ch) * 0.3; } // keep a bit more headroom than a plain centre crop
        const ow = Math.max(1, Math.round(Math.min(cw, 1200))), oh = Math.round(ow / aspect);
        const c = document.createElement("canvas"); c.width = ow; c.height = oh;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.fillStyle = "#fff"; g.fillRect(0, 0, ow, oh); g.imageSmoothingQuality = "high";
        g.drawImage(img, cx, cy, cw, ch, 0, 0, ow, oh);
        if ($("opt-bg").checked) whiten(g, ow, oh);
        return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(new File([b], `token-${job.token}.jpg`, { type: "image/jpeg" })) : bad(new Error("export nahi hua"))), "image/jpeg", 0.95));
    }
    function targetSize() {
        if (presetSelect.value === "custom") return [Number($("custom-width").value) || 35, Number($("custom-height").value) || 45];
        return SIZES[presetSelect.value] || SIZES.passport;
    }

    // ---------- open a customer's photo in the editor (and optionally print) ----------
    async function openJob(job, doPrint) {
        try {
            errorBox.hidden = true;
            const blob = await (await fetch(`/api/incoming/${job.id}/photo`)).blob();
            internal = true;
            presetSelect.value = job.preset; presetSelect.dispatchEvent(new Event("change"));
            copiesInput.value = job.copies; copiesInput.dispatchEvent(new Event("input"));
            internal = false;
            const [w, h] = targetSize(), file = await prepare(blob, w / h, job);
            internal = true; activeId = job.id;
            const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event("change"));
            internal = false;
            await waitFor(() => !selectedFile.hidden);
            generateButton.click();
            if (doPrint) { await sleep(150); printButton.click(); }
            card.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (e) { internal = false; showErr("Photo process nahi ho paayi: " + e.message); }
    }

    $("inbox-list").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        const job = jobs.find((j) => j.id === b.closest(".job").dataset.id);
        if (!job) return;
        if (b.dataset.act === "paid") { await api(job.id, "POST", { paid: !job.paid }); poll(); }
        else if (b.dataset.act === "del") { await api(job.id, "DELETE"); if (activeId === job.id) activeId = null; poll(); }
        else openJob(job, b.dataset.act === "print");
    });
    fileInput.addEventListener("change", () => { if (!internal) activeId = null; });
    $("remove-file").addEventListener("click", () => { activeId = null; });

    // Payment gate: capture phase, so it runs before app.js's print/download handlers.
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#print-button, #download-button")) return;
        const job = jobs.find((j) => j.id === activeId);
        if ($("opt-pay").checked && job && !job.paid) {
            e.stopPropagation(); e.preventDefault();
            showErr(`Token #${job.token}: pehle payment lein, phir list me "Unpaid" par click karke Paid karein.`);
        }
    }, true);
    document.addEventListener("click", (e) => { // only reached when the gate let the click through
        if (!activeId || !e.target.closest("#print-button, #download-button")) return;
        const j = jobs.find((x) => x.id === activeId);
        api(activeId, "POST", { done: true }); poll();
        if (j && !j.done) window.dispatchEvent(new CustomEvent("csc:printed", { detail: j }));
    });

    render(); drawQr(); poll(); setInterval(poll, 3000);
    if ($("opt-face").checked) getDetector(); // warm up the model so the first job is fast
})();
