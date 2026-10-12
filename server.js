"use strict";
// CSC Smart Workstation server. No npm install needed (Node 18+).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const crypto = require("crypto"), { exec } = require("child_process");
const QRCode = require("./vendor/QRCode"), QRLevel = require("./vendor/QRCode/QRErrorCorrectLevel");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, "public");
const MAX_BYTES = 15 * 1024 * 1024, MAX_JOBS = 60;
const PRESETS = ["passport", "square", "visa"];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".mjs": "text/javascript; charset=utf-8" };

let config = { shopName: "CSC Center", upiId: "", pricePerCopy: 5, minimum: 20 };
try { config = { ...config, ...JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")) }; } catch { /* config.json optional */ }
const jobs = new Map(); // photos live in memory only: nothing is written to disk
let counter = 0, day = new Date().toDateString();

const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const lanIp = () => {
    if (process.env.HOST_IP) return process.env.HOST_IP;
    const all = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
        if ((a.family !== "IPv4" && a.family !== 4) || a.internal || a.address.startsWith("192.168.56.") || a.address.startsWith("169.254.")) continue;
        all.push({ ip: a.address, wifi: /wi-?fi|wireless|wlan/i.test(name), bad: /virtual|vmware|vbox|vethernet|host-only|docker|wsl/i.test(name) });
    }
    all.sort((x, y) => (y.wifi - x.wifi) || (x.bad - y.bad));
    return (all[0] && all[0].ip) || "localhost";
};
const send = (res, code, body, type = "application/json", extra = {}) => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
    res.end(type === "application/json" && !Buffer.isBuffer(body) && typeof body !== "string" ? JSON.stringify(body) : body);
};
const readBody = (req, limit) => new Promise((ok, bad) => {
    const parts = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { bad(new Error("File bahut badi hai")); req.destroy(); return; } parts.push(c); });
    req.on("end", () => ok(Buffer.concat(parts)));
    req.on("error", bad);
});
const sniff = (b) => {
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b.length > 12 && b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
    if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
    return null;
};
function serveFile(res, file) {
    let data = fs.readFileSync(file);
    if (path.basename(file) === "index.html") { // inject the add-on so index.html needs no editing
        let html = data.toString("utf8");
        if (!html.includes("incoming.js")) html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="incoming.css"></head>').replace(/<\/body>/i, '<script src="incoming.js" defer></script></body>');
        data = html;
    }
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://x"), p = url.pathname, local = isLocal(req);

        // Open to customers on the shop WiFi: only the upload page and the upload itself.
        if (req.method === "POST" && p === "/api/upload") {
            const body = await readBody(req, MAX_BYTES), type = sniff(body);
            if (!type) return send(res, 400, { error: "Sirf photo (JPG/PNG/WEBP) bhejein" });
            if (jobs.size >= MAX_JOBS) return send(res, 429, { error: "Abhi line full hai, counter par bataiye" });
            if (new Date().toDateString() !== day) { day = new Date().toDateString(); counter = 0; }
            const q = url.searchParams, preset = PRESETS.includes(q.get("preset")) ? q.get("preset") : "passport";
            const copies = Math.min(100, Math.max(1, parseInt(q.get("copies"), 10) || 8));
            const name = (q.get("name") || "photo").replace(/[^\w .-]/g, "").slice(0, 40) || "photo";
            const amount = Math.max(Number(config.minimum) || 0, copies * (Number(config.pricePerCopy) || 0));
            const job = { amount, id: crypto.randomBytes(6).toString("hex"), token: ++counter, name, preset, copies, type, buf: body, time: Date.now(), paid: false, done: false };
            jobs.set(job.id, job);
            const upi = config.upiId && amount > 0 ? `upi://pay?pa=${encodeURIComponent(config.upiId)}&pn=${encodeURIComponent(config.shopName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Token " + job.token)}` : null;
            return send(res, 200, { token: job.token, amount, upi });
        }
        if (p === "/upload") return serveFile(res, path.join(PUBLIC, "upload.html"));
        if (!local) return send(res, 403, "Ye page sirf shop ke computer par khulta hai.", "text/plain");

        // Operator-only (shop computer / localhost).
        if (p === "/api/shop") return send(res, 200, { shopName: config.shopName });
        if (p === "/api/qr") {
            const target = `http://${lanIp()}:${PORT}/upload`, qr = new QRCode(-1, QRLevel.M);
            qr.addData(target); qr.make();
            const n = qr.getModuleCount(), rows = [];
            for (let r = 0; r < n; r++) { let s = ""; for (let c = 0; c < n; c++) s += qr.isDark(r, c) ? "1" : "0"; rows.push(s); }
            return send(res, 200, { url: target, n, rows });
        }
        if (p === "/api/incoming" && req.method === "GET") return send(res, 200, [...jobs.values()].map(({ buf, ...j }) => ({ ...j, size: buf.length })));
        const m = p.match(/^\/api\/incoming\/(\w+)(\/photo)?$/);
        if (m) {
            const job = jobs.get(m[1]);
            if (!job) return send(res, 404, { error: "Nahi mili" });
            if (m[2]) return send(res, 200, job.buf, job.type, { "Cache-Control": "private, max-age=3600" });
            if (req.method === "DELETE") { jobs.delete(job.id); return send(res, 200, { ok: true }); }
            if (req.method === "POST") {
                const d = JSON.parse((await readBody(req, 2000)).toString() || "{}");
                if (typeof d.paid === "boolean") job.paid = d.paid;
                if (d.done === true) { job.done = true; job.doneAt = Date.now(); }
                return send(res, 200, { ok: true });
            }
        }
        const file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
        if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
        serveFile(res, file);
    } catch (e) { send(res, 500, { error: e.message }); }
});

setInterval(() => { // auto-delete: 3 hours old, or 10 minutes after printing
    const now = Date.now();
    for (const [id, j] of jobs) if (now - j.time > 3 * 3600e3 || (j.done && now - j.doneAt > 600e3)) jobs.delete(id);
}, 60e3).unref();

server.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? `Port ${PORT} pehle se use me hai. Purani server window band karein.` : e.message); process.exit(1); });
server.listen(PORT, "0.0.0.0", () => {
    const local = `http://localhost:${PORT}`;
    console.log(`\n CSC Workstation chalu hai\n  Shop computer : ${local}\n  Customer QR   : http://${lanIp()}:${PORT}/upload\n\n (Is window ko band mat karna)\n`);
    if (!process.env.NO_OPEN) exec(process.platform === "win32" ? `start "" "${local}"` : process.platform === "darwin" ? `open "${local}"` : `xdg-open "${local}"`, () => {});
});
