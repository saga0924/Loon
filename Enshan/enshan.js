/**
 * 恩山论坛 · 每日签到（Loon）
 *
 * 流程参考开源青龙签到脚本（agluo/ql-script-hub 的 enshan_checkin.py）改写：
 *   抓取：打开插件「抓取开关」后，在 Safari 登录恩山并打开签到页，脚本把 Cookie 存进 Loon 本地存储。
 *   签到：每天定时运行——取签到页 formhash（遇阿里云 WAF 的 JS 挑战时自动解算过验证）→ POST 签到接口 → 通知结果。
 * Cookie 只保存在本机 Loon 的 $persistentStore，不上传任何服务器。
 */

const BASE = "https://www.right.com.cn/forum";
const SIGN_PAGE = BASE + "/erling_qd-sign_in.html";
const SIGN_URL = BASE + "/plugin.php?id=erling_qd:action&action=sign";
const CREDIT_URL = BASE + "/home.php?mod=spacecp&ac=credit&showcredit=1";
const STORE_KEY = "enshan_cookie";
const NAME = "恩山签到";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function log(msg) { console.log(msg); }
function notify(subtitle, body) { $notification.post(NAME, subtitle || "", body || ""); }
function storeRead() { return $persistentStore.read(STORE_KEY) || ""; }
function storeWrite(v) { $persistentStore.write(v, STORE_KEY); }

function httpGet(url, headers) {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url: url, headers: headers }, (err, resp, data) => {
            if (err) reject(new Error(String(err)));
            else resolve({ status: resp.status, headers: resp.headers || {}, body: data || "" });
        });
    });
}
function httpPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url: url, headers: headers, body: body }, (err, resp, data) => {
            if (err) reject(new Error(String(err)));
            else resolve({ status: resp.status, headers: resp.headers || {}, body: data || "" });
        });
    });
}

function navHeaders(cookie) {
    return {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": SIGN_PAGE,
        "Cookie": cookie
    };
}

/* ---------------- Cookie 工具 ---------------- */

function upsertCookie(base, kv) {
    if (!kv || kv.indexOf("=") < 0) return base || "";
    const eq = kv.indexOf("=");
    const nk = kv.slice(0, eq).trim(), nv = kv.slice(eq + 1).trim();
    const parts = [];
    let replaced = false;
    (base || "").split(";").forEach((raw) => {
        const part = raw.trim();
        if (!part || part.indexOf("=") < 0) return;
        const e2 = part.indexOf("=");
        const k = part.slice(0, e2).trim(), v = part.slice(e2 + 1).trim();
        if (k === nk) { parts.push(nk + "=" + nv); replaced = true; }
        else parts.push(k + "=" + v);
    });
    if (!replaced) parts.push(nk + "=" + nv);
    return parts.join("; ");
}

function splitSetCookie(str) {
    // 按“逗号 + 新 cookie 名=”切分，避开 Expires 日期里的逗号
    return String(str).split(/,(?=\s*[A-Za-z0-9_\-.]+=[^;,])/).map((s) => s.trim()).filter(Boolean);
}

function mergeSetCookie(cookie, headers) {
    let raw = null;
    for (const k of Object.keys(headers || {})) {
        if (k.toLowerCase() === "set-cookie") { raw = headers[k]; break; }
    }
    if (!raw) return cookie;
    const items = Array.isArray(raw) ? raw : splitSetCookie(raw);
    let out = cookie;
    for (const item of items) {
        const first = String(item).split(";")[0].trim();
        if (first.indexOf("=") > 0) out = upsertCookie(out, first);
    }
    return out;
}

/* ---------------- WAF(JS 挑战)解算：移植自上述开源脚本 ---------------- */

function rotl8(x, r) {
    x &= 0xFF; r &= 7;
    return ((x << r) & 0xFF) | (x >> (8 - r));
}
function rotr8(x, r) {
    x &= 0xFF; r &= 7;
    return (x >> r) | ((x << (8 - r)) & 0xFF);
}

function extractOO(html) {
    const m = String(html).match(/oo\s*=\s*\[([^\]]+)\]/);
    if (!m) return null;
    const tokens = m[1].match(/0x[0-9a-fA-F]+|\d+/g);
    if (!tokens || !tokens.length) return null;
    return tokens.map((t) => (t.toLowerCase().indexOf("0x") === 0 ? parseInt(t, 16) : parseInt(t, 10)) & 0xFF);
}

function extractWI(html) {
    let m = String(html).match(/setTimeout\("\w+\((\d+)\)"/);
    if (m) return parseInt(m[1], 10);
    m = String(html).match(/\b\w+\((\d+)\)/);
    if (m) return parseInt(m[1], 10);
    return null;
}

function extractLoop1(html) {
    const re = /qo\s*=\s*(\d+);\s*do\{[\s\S]*?oo\[qo\]=\(-oo\[qo\]\)&0xff;[\s\S]*?oo\[qo\]=\(\(\(oo\[qo\]>>(\d+)\)\|\(\(oo\[qo\]<<(\d+)\)&0xff\)\)-(\d+)\)&0xff;[\s\S]*?\}\s*while\(--qo>=2\);/;
    const m = String(html).match(re);
    if (!m) return null;
    return { start: parseInt(m[1], 10), shift_r: parseInt(m[2], 10), shift_l: parseInt(m[3], 10), sub: parseInt(m[4], 10) };
}

function extractLoop2Start(html) {
    const re = /qo\s*=\s*(\d+);\s*do\s*\{[^}]*?oo\[qo\]\s*=\s*\(oo\[qo\]\s*-\s*oo\[qo\s*-\s*1\]\)\s*&\s*0xff;[^}]*?\}\s*while\s*\(\s*--\s*qo\s*>=\s*3\s*\)/;
    const m = String(html).match(re);
    return m ? parseInt(m[1], 10) : null;
}

function extractLoop3(html) {
    const blockM = String(html).match(/qo\s*=\s*1;\s*for\s*\([\s\S]*?\)\s*\{([\s\S]*?)\}\s*po\s*=/);
    if (!blockM) return null;
    const block = blockM[1];
    const upperM = block.match(/qo\s*>\s*(\d+)\)\s*break/);
    if (!upperM) return null;
    const assignM = block.match(/oo\[qo\]\s*=\s*([\s\S]+?);/);
    if (!assignM) return null;
    const expr = assignM[1];
    const adds = [];
    let am;
    const addRe = /\+\s*(\d+)/g;
    while ((am = addRe.exec(expr)) !== null) adds.push(parseInt(am[1], 10));
    if (adds.length < 2) return null;
    const shifts = [];
    const shRe = /<<\s*(\d+)|>>\s*(\d+)/g;
    let sm;
    while ((sm = shRe.exec(expr)) !== null) {
        if (sm[1] !== undefined) shifts.push(parseInt(sm[1], 10));
        else if (sm[2] !== undefined) shifts.push(parseInt(sm[2], 10));
    }
    if (shifts.length < 2) return null;
    return { upper: parseInt(upperM[1], 10), add1: adds[0], add2: adds[1], rot_l: shifts[0] };
}

function extractModSkip(html) {
    const m = String(html).match(/qo\s*%\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 7;
}

function decodePO(ooInput, wi, p) {
    const oo = ooInput.map((b) => b & 0xFF);
    if (oo.length < 6) return "";
    const lastIndex = oo.length - 1;

    let qo = Math.min(p.loop1_start, lastIndex - 1);
    while (true) {
        oo[qo] = (-oo[qo]) & 0xFF;
        if (p.shift_r + p.shift_l === 8) {
            oo[qo] = (rotr8(oo[qo], p.shift_r) - p.sub) & 0xFF;
        } else {
            oo[qo] = (((oo[qo] >> p.shift_r) | ((oo[qo] << p.shift_l) & 0xFF)) - p.sub) & 0xFF;
        }
        qo -= 1;
        if (qo < 2) break;
    }

    qo = Math.min(p.loop2_start, lastIndex - 2);
    while (true) {
        oo[qo] = (oo[qo] - oo[qo - 1]) & 0xFF;
        qo -= 1;
        if (qo < 3) break;
    }

    const up = Math.min(p.loop3_upper, lastIndex - 1);
    for (let i = 1; i <= up; i++) {
        let x = (oo[i] + p.add1) & 0xFF;
        x = (x + p.add2) & 0xFF;
        oo[i] = rotl8(x, p.rot_l);
    }

    let out = "";
    for (let i = 1; i < lastIndex; i++) {
        if (i % p.mod_skip !== 0) out += String.fromCharCode((oo[i] ^ (wi & 0xFF)) & 0xFF);
    }
    return out;
}

function extractCookieKV(decoded) {
    const m = String(decoded).match(/document\.cookie=['"]([^'"]+)['"]/);
    if (!m) return null;
    const s = m[1].trim();
    if (!s) return null;
    return s.split(";")[0].trim();
}

/* ---------------- 业务逻辑 ---------------- */

function extractFormhash(html) {
    const s = String(html || "");
    let m = s.match(/name="formhash"\s+value="([0-9a-fA-F]+)"/);
    if (m) return m[1];
    m = s.match(/member\.php\?mod=logging(?:&amp;|&)action=logout(?:&amp;|&)formhash=([0-9a-fA-F]+)/);
    if (m) return m[1];
    return null;
}

function diagResp(tag, resp) {
    const b = (resp && resp.body) || "";
    const marks = [];
    if (b.indexOf("formhash") >= 0) marks.push("含formhash字样");
    if (extractOO(b)) marks.push("WAF挑战页");
    if (b.indexOf("滑动") >= 0 || b.toLowerCase().indexOf("captcha") >= 0) marks.push("含验证字样");
    if (b.indexOf("erling_qd") >= 0) marks.push("签到页内容");
    if (/您需要先登录/.test(b)) marks.push("未登录");
    if (b.indexOf("mod=logging") >= 0) marks.push("含登录入口");
    log("[诊断] " + tag + ": HTTP " + (resp && resp.status) + ", " + b.length + " 字节, " + (marks.length ? marks.join(" / ") : "无特征标记"));
}

async function refreshFormhash(cookie) {
    // 返回 { cookie, formhash, loginRequired }
    let loginRequired = false;
    const noteLogin = (html) => { if (/您需要先登录/.test(html || "")) loginRequired = true; };

    let resp = await httpGet(SIGN_PAGE, navHeaders(cookie));
    cookie = mergeSetCookie(cookie, resp.headers);
    noteLogin(resp.body);
    diagResp("签到页", resp);
    let fh = extractFormhash(resp.body);
    if (fh) return { cookie: cookie, formhash: fh, loginRequired: false };

    const oo = extractOO(resp.body);
    if (oo) {
        const wi = extractWI(resp.body);
        const l1 = extractLoop1(resp.body);
        const l2 = extractLoop2Start(resp.body);
        const l3 = extractLoop3(resp.body);
        if (wi !== null && l1 && l2 !== null && l3) {
            const po = decodePO(oo, wi, {
                loop1_start: l1.start, loop2_start: l2, loop3_upper: l3.upper,
                shift_r: l1.shift_r, shift_l: l1.shift_l, sub: l1.sub,
                add1: l3.add1, add2: l3.add2, rot_l: l3.rot_l,
                mod_skip: extractModSkip(resp.body)
            });
            const kv = extractCookieKV(po);
            if (kv) {
                log("WAF 挑战解算成功，已刷新验证 Cookie");
                cookie = upsertCookie(cookie, kv);
                const resp2 = await httpGet(SIGN_PAGE, navHeaders(cookie));
                cookie = mergeSetCookie(cookie, resp2.headers);
                noteLogin(resp2.body);
                diagResp("解算后重试", resp2);
                fh = extractFormhash(resp2.body);
                if (fh) return { cookie: cookie, formhash: fh, loginRequired: false };
            } else {
                log("WAF 解算未得到 Cookie");
            }
        } else {
            log("WAF 挑战参数提取不全");
        }
    }

    const resp3 = await httpGet(BASE + "/forum.php", navHeaders(cookie));
    cookie = mergeSetCookie(cookie, resp3.headers);
    noteLogin(resp3.body);
    diagResp("论坛首页", resp3);
    fh = extractFormhash(resp3.body);
    return { cookie: cookie, formhash: fh, loginRequired: loginRequired };
}

async function doSign(cookie, formhash) {
    const headers = {
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://www.right.com.cn",
        "Referer": SIGN_PAGE,
        "Cookie": cookie
    };
    const resp = await httpPost(SIGN_URL, headers, "formhash=" + encodeURIComponent(formhash));
    const text = resp.body || "";
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) { obj = null; }
    if (obj && typeof obj === "object") {
        const message = String(obj.message || "").trim();
        if (obj.success === true || obj.status === 1 || obj.status === "1" || obj.status === "success") {
            return { ok: true, message: message || "签到成功" };
        }
        if (message.indexOf("已签到") >= 0 || message.indexOf("已经签到") >= 0) return { ok: true, message: message };
        if (message.indexOf("成功") >= 0) return { ok: true, message: message };
        if (message) return { ok: false, message: message };
        return { ok: true, message: "签到请求已提交" };
    }
    if (text.indexOf("成功") >= 0 || text.indexOf("已签到") >= 0) return { ok: true, message: "签到成功" };
    return { ok: false, message: "签到接口返回异常：" + text.slice(0, 80) };
}

async function getCoin(cookie) {
    try {
        const resp = await httpGet(CREDIT_URL, navHeaders(cookie));
        const html = resp.body || "";
        const coin = html.match(/恩山币\s*[:：]\s*(?:<\/em>)?\s*([^<&\s]+)/);
        const point = html.match(/积分\s*[:：]\s*(?:<\/em>)?\s*([^<&\s]+)/);
        const parts = [];
        if (coin) parts.push("恩山币 " + coin[1]);
        if (point) parts.push("积分 " + point[1]);
        return parts.join(" · ");
    } catch (e) {
        return "";
    }
}

function sendMsg(message) {
    if (!message) return;
    // 仅失败时通知：erronly 未被明确关闭（false/"false"）时，内容含 ❌/⚠️ 才发通知，否则只记日志
    const errVal = typeof $argument === "object" && !!$argument ? $argument.erronly : undefined;
    log("[自检] erronly 参数 = " + JSON.stringify(errVal));
    const errOnly = errVal !== false && errVal !== "false";
    if (errOnly && message.indexOf("❌") < 0 && message.indexOf("⚠️") < 0) {
        log("\n" + NAME + "（仅失败通知模式，跳过本次通知）\n" + message);
        return;
    }
    notify("", message);
}

/* ---------------- 入口 ---------------- */

function isCaptureMode() {
    return typeof $request !== "undefined" && !!$request && !!$request.headers;
}

async function captureMain() {
    const headers = $request.headers || {};
    const cookie = headers["Cookie"] || headers["cookie"] || "";
    if (cookie && cookie.indexOf("_auth=") >= 0) {
        const old = storeRead();
        if (old !== cookie) {
            storeWrite(cookie);
            notify("✅ Cookie 抓取成功", "恩山登录 Cookie 已保存，可以关闭抓取开关了");
            log("恩山 Cookie 已保存/更新");
        } else {
            log("恩山 Cookie 未变化，跳过");
        }
    } else {
        log("本次请求未带登录 Cookie，跳过抓取");
    }
    $done({});
}

function fmtMin(m) {
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

// 执行一次真正的签到流程，返回 { ok, message }
async function doDailySign() {
    let cookie = storeRead();
    if (!cookie) {
        return { ok: false, message: "❌ 还没有抓到 Cookie：请打开插件的「抓取开关」，在 Safari 登录恩山并打开一次签到页" };
    }
    const got = await refreshFormhash(cookie);
    cookie = got.cookie;
    storeWrite(cookie);
    if (!got.formhash) {
        if (got.loginRequired) return { ok: false, message: "❌ Cookie 已失效，请重新打开抓取开关抓一次" };
        return { ok: false, message: "❌ 没取到签到参数（可能被 WAF 拦住），请在 Safari 打开一次恩山签到页后再试，或重新抓取 Cookie" };
    }
    const res = await doSign(cookie, got.formhash);
    if (res.ok) {
        let line = "✅ " + res.message;
        const coin = await getCoin(cookie);
        if (coin) line += "\n" + coin;
        return { ok: true, message: line };
    }
    return { ok: false, message: "❌ 签到失败：" + res.message };
}

async function cronMain() {
    // 随机时间窗：每天在 08:00–10:00 之间随机挑一个时间点签到（cron 每 10 分钟唤醒一次，未到点/已完成立即退出）
    const now = new Date();
    const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    let state = {};
    try { state = JSON.parse($persistentStore.read("enshan_state") || "{}"); } catch (e) { state = {}; }
    if (!state || state.date !== today) {
        state = { date: today, target: 8 * 60 + Math.floor(Math.random() * 120), done: false, attempts: 0, failNotified: false };
        $persistentStore.write(JSON.stringify(state), "enshan_state");
        log("今日随机签到时间：" + fmtMin(state.target));
    }
    if (state.done) { log("今日已完成签到，跳过"); return; }
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < state.target) { log("未到随机签到时间 " + fmtMin(state.target) + "，跳过"); return; }

    state.attempts = (state.attempts || 0) + 1;
    let result;
    try {
        result = await doDailySign();
    } catch (e) {
        result = { ok: false, message: "❌ 运行异常: " + (e && e.message ? e.message : String(e)) };
    }
    if (result.ok) {
        state.done = true;
        $persistentStore.write(JSON.stringify(state), "enshan_state");
        sendMsg(result.message);
    } else {
        $persistentStore.write(JSON.stringify(state), "enshan_state");
        if (state.failNotified) {
            log(result.message + "（今日已通知过失败，本次只记日志，下一个整点十分钟继续重试）");
        } else {
            state.failNotified = true;
            $persistentStore.write(JSON.stringify(state), "enshan_state");
            sendMsg(result.message);
        }
    }
}

if (typeof $notification !== "undefined" && typeof $done === "function") {
    if (isCaptureMode()) {
        captureMain();
    } else {
        cronMain().then(() => $done()).catch(() => $done());
    }
}

// 供本地对照测试导出（Loon 环境下无 module，不受影响）
if (typeof module !== "undefined" && module.exports) {
    module.exports = { rotl8, rotr8, extractOO, extractWI, extractLoop1, extractLoop2Start, extractLoop3, extractModSkip, decodePO, extractCookieKV, upsertCookie, extractFormhash, splitSetCookie };
}
