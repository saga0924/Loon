/**
 * emos 自动签到脚本 for Loon
 * 功能：Token 捕获、随机文案、每日签到、修仙进度、仅失败时通知。
 * 搭配 Loon/Lpx/🥕emos.lpx：Loon 3.5.1(983)+ 新版 script(...) 语法。
 * 参数：script("emos.js", {${comment}, ${ErrorNotify_emos}})，$argument 为对象。
 * JS API 保持不变；兼容旧插件传入的对象及手动配置的 JSON 字符串。
 * 保留 emos_best_token 存储键，无需重新获取已有 Token。
 * 文档：https://nsloon.app/docs/Script/script_v2
 *       https://nsloon.app/docs/Script/script_api
 * 更新时间：2026-11-20 / 版本：1.5.2 / 作者：Myles
 * 优化（1.5.2）：签到重试改为 1s/2s/4s 退避；证书类错误不再重试；单次请求超时 15s→25s。
 */

const isGetToken = typeof $request !== "undefined" && $request !== null;
const tokenKey = "emos_best_token";
const baseUrl = "https://emos.best";
const defaultComment = "签到,我要🥕";
const runDeadline = Date.now() + 80000;
let completed = false;

// ================= 参数与运行上下文 =================
function loadConfig() {
    const config = { comment: defaultComment, ErrorNotify_emos: false };
    if (typeof $argument === "undefined" || $argument === null) return config;
    try {
        const args = typeof $argument === "string" ? JSON.parse($argument) : $argument;
        if (!args || typeof args !== "object") return config;
        // 新版插件传入命名对象；兼容手动配置的旧数组，不做字符串模板拼接。
        const comment = Array.isArray(args) ? args[0] : args.comment;
        const errorOnly = Array.isArray(args) ? args[1] : args.ErrorNotify_emos;
        if (typeof comment === "string" && comment.trim()) config.comment = comment;
        if (errorOnly === true || errorOnly === "true") config.ErrorNotify_emos = true;
    } catch (e) {
        console.log("[emos签到] 参数解析失败，使用默认文案和通知设置。");
    }
    return config;
}

function finish() {
    if (completed) return;
    completed = true;
    // HTTP 捕获必须传空对象放行；cron 无需返回值。
    if (isGetToken) $done({});
    else $done();
}

function getHeader(headers, name) {
    const key = Object.keys(headers || {}).find(key => key.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key]).trim() : "";
}

function normalizeToken(value) {
    const match = String(value || "").trim().match(/^Bearer\s+(\S+)$/i);
    return match ? "Bearer " + match[1] : "";
}

function asNumber(value) {
    if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function pointText(value) {
    const points = asNumber(value);
    return points === null ? "未知" : (points >= 0 ? "+" : "") + points;
}

function chinaDay(time) {
    return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function signedToday(sign) {
    const value = sign && typeof sign.sign_at === "string" ? sign.sign_at.trim() : "";
    if (!value) return false;
    // 无时区的服务端日期按北京时间处理；带 Z/偏移量的时间先转换，避免跨日误判。
    if (/^\d{4}-\d{2}-\d{2}(?:[ T]|$)/.test(value) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
        return value.slice(0, 10) === chinaDay(Date.now());
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && chinaDay(parsed) === chinaDay(Date.now());
}

// ================= 修仙境界体系数据 =================
const cultivationLevels = [
    { n: "👤凡人期", max: 9 }, { n: "💨练气期·一层", max: 19 }, { n: "💨练气期·二层", max: 29 },
    { n: "💨练气期·三层", max: 39 }, { n: "💨练气期·四层", max: 49 }, { n: "💨练气期·五层", max: 59 },
    { n: "💨练气期·六层", max: 69 }, { n: "💨练气期·七层", max: 79 }, { n: "💨练气期·八层", max: 89 },
    { n: "💨练气期·九层", max: 99 }, { n: "🏛️筑基期·初期", max: 149 }, { n: "🏛️筑基期·中期", max: 299 },
    { n: "🏛️筑基期·后期", max: 599 }, { n: "🏛️筑基期·圆满", max: 999 }, { n: "💎结丹期·初期", max: 1999 },
    { n: "💎结丹期·中期", max: 3499 }, { n: "💎结丹期·后期", max: 5999 }, { n: "💎结丹期·圆满", max: 9999 },
    { n: "👶元婴期·初期", max: 19999 }, { n: "👶元婴期·中期", max: 34999 }, { n: "👶元婴期·后期", max: 59999 },
    { n: "👶元婴期·圆满", max: 99999 }, { n: "✨化神期", max: 499999 }, { n: "🌌炼虚期", max: 999999 },
    { n: "🔗合体期", max: 9999999 }, { n: "🌟大乘期", max: 99999999 }, { n: "👑真仙期", max: Infinity }
];

function getCultivationInfo(carrot) {
    let min = 0;
    for (let i = 0; i < cultivationLevels.length; i++) {
        const max = cultivationLevels[i].max;
        if (carrot <= max) {
            const nextNeed = max === Infinity ? 0 : max - carrot + 1;
            const currentTotal = max === Infinity ? 1 : max - min + 1;
            const ratio = max === Infinity ? 1 : Math.max(0, Math.min(1, (carrot - min) / currentTotal));
            const filledCount = Math.floor(ratio * 10);
            const bar = "■".repeat(filledCount) + "□".repeat(10 - filledCount);
            return { name: cultivationLevels[i].n, bar, percent: (ratio * 100).toFixed(1), nextNeed };
        }
        min = max + 1;
    }
    return { name: "未知", bar: "□□□□□□□□□□", percent: "0.0", nextNeed: 0 };
}

// ================= Token 捕获 =================
function captureToken() {
    if (!/^https:\/\/emos\.best\/api\//.test(String($request.url || ""))) return;
    const token = normalizeToken(getHeader($request.headers, "Authorization"));
    if (!token) return;
    const oldToken = normalizeToken($persistentStore.read(tokenKey));
    if (token === oldToken) {
        console.log("[emos签到] Token 无变化，无需更新。");
        return;
    }
    if (!$persistentStore.write(token, tokenKey)) throw new Error("Token 保存失败，请检查 Loon 本地存储。");
    $notification.post("emos 签到", "🥕 Token 获取/更新成功", "凭证已保存，可关闭 Token 获取开关。", { openUrl: baseUrl + "/#/home" });
}

// ================= 网络与签到 =================
function networkErrorDetail(error, token) {
    let detail = typeof error === "string" ? error : "未知网络错误";
    if (error && typeof error === "object") {
        const message = error.message || error.localizedDescription || error.description;
        if (typeof message === "string" && message) detail = message;
        if (typeof error.code === "string" || typeof error.code === "number") detail += "（code=" + error.code + "）";
    }
    // 只保留诊断文字，不序列化错误对象中的请求头或响应；先脱敏再截断。
    const credential = String(token || "");
    const bareToken = credential.replace(/^Bearer\s+/i, "");
    for (const secret of [credential, bareToken, encodeURIComponent(credential), encodeURIComponent(bareToken)]) {
        if (secret) detail = detail.split(secret).join("[已隐藏]");
    }
    return detail
        .replace(/https?:\/\/[^\s"'<>]+/gi, url => url.replace(/^(https?:\/\/)[^/]*@/i, "$1").split(/[?#]/)[0])
        .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [已隐藏]")
        .replace(/\b(authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=][^\r\n]*/gi, "$1=[已隐藏]")
        .replace(/[\r\n\t]+/g, " ").trim().slice(0, 400) || "未知网络错误";
}

function request(method, path, token) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const timeout = Math.min(25000, runDeadline - started);
        if (timeout <= 0) return reject(new Error("运行时间不足，请稍后重试。"));
        let settled = false;
        const options = {
            url: baseUrl + path,
            timeout, // $httpClient 为毫秒；插件 with timeout 为秒。
            "auto-redirect": false,
            headers: {
                Authorization: token,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
                Referer: baseUrl + "/",
                Origin: baseUrl
            }
        };
        function callback(error, response, data) {
            if (settled) return;
            settled = true;
            if (error) {
                const err = new Error("网络请求失败：" + method.toUpperCase() + " " + path.split(/[?#]/)[0] +
                    "\n原因：" + networkErrorDetail(error, token) +
                    "\n耗时：" + (Date.now() - started) + "ms；超时上限：" + timeout + "ms");
                err.network = true;
                // 证书类错误重试也没有意义，直接失败，省时间。
                err.retryable = !/certificate|ssl/i.test(err.message);
                reject(err);
                return;
            }
            resolve({ status: Number(response && (response.status || response.statusCode)), data });
        }
        // 使用原生请求超时，不依赖文档未保证的 clearTimeout/clearInterval。
        try { $httpClient[method](options, callback); } catch (e) { callback(e); }
    });
}

function parseResponse(data) {
    try {
        const obj = JSON.parse(data);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error();
        return obj;
    } catch (e) { throw new Error("接口返回非有效 JSON 对象，请在网页确认服务状态。"); }
}

function statusError(status, label) {
    if (status === 401 || status === 403) return new Error("Token 已失效或无权限，请开启获取开关重新登录 emos。");
    return new Error(label + "失败：HTTP " + (status || "状态未知"));
}

async function fetchUser(token) {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            response = await request("get", "/api/user", token);
            break;
        } catch (e) {
            // 仅重试只读请求的传输错误；HTTP 错误、无效 JSON、鉴权失败和证书错误不重试。
            if (!e.network || e.retryable === false || attempt === 1 || runDeadline - Date.now() <= 1000) throw e;
            console.log("[emos签到] " + e.message + "\n1 秒后重试获取用户信息（仅重试一次）。");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    if (response.status !== 200) throw statusError(response.status, "获取用户信息");
    const user = parseResponse(response.data);
    if (asNumber(user.carrot) === null) throw new Error("用户信息缺少有效萝卜余额，无法确认账号状态。");
    return user;
}

async function executeCheckin(token, content) {
    const path = "/api/user/sign?content=" + encodeURIComponent(content);
    for (let attempt = 0; attempt <= 3; attempt++) {
        let response;
        try { response = await request("put", path, token); }
        catch (e) {
            if (!e.network || e.retryable === false || attempt === 3) throw e;
            const delay = [1000, 2000, 4000][attempt];
            console.log("[emos签到] 网络请求失败，" + delay + "ms 后重试（剩余 " + (3 - attempt) + " 次）。");
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
        if (response.status === 200) {
            const sign = parseResponse(response.data);
            if (asNumber(sign.earn_point) === null || asNumber(sign.continuous_days) === null) {
                throw new Error("签到响应缺少奖励或连签信息，未确认签到成功。");
            }
            return { repeated: false, sign };
        }
        if (response.status === 429) {
            const result = parseResponse(response.data);
            if (result.message === "重复签到") return { repeated: true };
            throw new Error("签到请求过于频繁（HTTP 429），本轮不再重试。");
        }
        throw statusError(response.status, "签到");
    }
}

function report(user, repeated, message, config) {
    const subtitle = repeated ? "🎉 今日已签到" : "🥕 签到成功";
    let logMsg = message;
    if (repeated && user.sign) {
        const sign = user.sign;
        logMsg = "签到时间: " + (sign.sign_at || "未知") + "\n萝卜变动: " + pointText(sign.earn_point) +
            " 🥕 | 连签: " + (asNumber(sign.continuous_days) === null ? "未知" : Number(sign.continuous_days)) + "天";
    }
    const totalCarrot = Number(user.carrot);
    const level = getCultivationInfo(totalCarrot);
    logMsg += "\n\n💐 修为: [" + level.name + "] " + totalCarrot + "🥕";
    if (level.nextNeed > 0) {
        logMsg += "\n⚡️ 进度: [" + level.bar + "] " + level.percent + "%\n🎯 破境: 距下一层还需 " + level.nextNeed + " 🥕";
    } else {
        logMsg += "\n⚡️ 进度: " + level.bar + " 100%\n👑 状态: 已至极境，法力无边！";
    }
    console.log("\n============== EMOS 签到日志 ==============\n" + subtitle + "\n\n" + logMsg + "\n===========================================");
    if (!config.ErrorNotify_emos) $notification.post("emos 签到", subtitle, logMsg);
}

async function main() {
    if (isGetToken) { captureToken(); return; }
    const config = loadConfig();
    const token = normalizeToken($persistentStore.read(tokenKey));
    if (!token) throw new Error("未找到有效 Token，请开启获取开关，登录并刷新 emos 页面。");
    const user = await fetchUser(token);
    if (signedToday(user.sign)) {
        console.log("[emos签到] 检测到今日已签到，跳过签到请求。");
        report(user, true, "今日已获取萝卜，无需重复操作。", config);
        return;
    }
    let pool = config.comment.split(/[,，]/).map(text => text.trim()).filter(Boolean);
    if (!pool.length) pool = defaultComment.split(",");
    const content = pool[Math.floor(Math.random() * pool.length)];
    const result = await executeCheckin(token, content);
    const message = result.repeated ? "今日已获取萝卜，无需重复操作。" :
        "文案: " + content + "\n萝卜变动: " + pointText(result.sign.earn_point) + " 🥕 | 连签: " + Number(result.sign.continuous_days) + "天";
    // 重新读取真实余额，不使用字符串相加或客户端时间伪造用户状态。
    let latest;
    try { latest = await fetchUser(token); }
    catch (e) { throw new Error((result.repeated ? "服务端提示重复签到" : "签到已成功") + "，但刷新用户信息失败：" + e.message); }
    report(latest, result.repeated, message, config);
}

main().catch(error => {
    console.log("[emos签到] " + error.message);
    $notification.post("emos 签到", isGetToken ? "❌ Token 捕获失败" : "❌ 执行异常", error.message);
}).then(finish);
