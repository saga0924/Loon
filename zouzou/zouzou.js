/*
 * 出去走走 · 自动提交步数 (Loon)
 * ------------------------------------------------------------
 * 原理: 复刻镜像站网页的真实提交动作 (2026-11-07 本机抓包确认):
 *   POST http://8.140.250.130/king/api/step
 *   form: phone=<Zepp账号>  pwd=<密码>  num=<步数>
 *   成功判定从宽: HTTP 200 且返回含 code 200/0 或「成功」字样.
 *
 * 配置方式 (二选一):
 *  1) 通过插件 .lpx 安装: 在插件参数里填账号/密码 (只存本机 Loon).
 *  2) 作为本地脚本运行: 把下面 CONFIG 里的 account / password 改成你的.
 *
 * 步数策略 (gradual 开启时, 按当前时间段递增, 更像真人):
 *   上午段 6000-10000 · 中午段 8000-14000 · 下午段 10000-18000
 *   傍晚段 12000-22000 · 晚上最终段 = 你设置的 min-max 随机
 * gradual 关闭时: 每次都直接提交 min-max 之间的随机步数.
 */

const CONFIG = {
  account: "",     // 本地脚本模式才需要填; 用插件参数时留空
  password: "",    // 本地脚本模式才需要填; 用插件参数时留空
  minStep: 18000,
  maxStep: 30000,
  gradual: true,
  apiUrl: "http://8.140.250.130/king/api/step",
};

// ---------- 读取参数 (插件 $argument 优先) ----------
function argVal(key, fallback) {
  try {
    if (typeof $argument !== "undefined" && $argument) {
      if (typeof $argument === "object" && $argument[key] !== undefined && $argument[key] !== "") {
        return $argument[key];
      }
      if (typeof $argument === "string") {
        const m = $argument.match(new RegExp(key + "=([^&]+)"));
        if (m) return decodeURIComponent(m[1]);
      }
    }
  } catch (e) {}
  return fallback;
}

const account  = String(argVal("account", CONFIG.account) || "").trim();
const password = String(argVal("password", CONFIG.password) || "");
const minStep  = parseInt(argVal("minStep", CONFIG.minStep)) || CONFIG.minStep;
const maxStep  = parseInt(argVal("maxStep", CONFIG.maxStep)) || CONFIG.maxStep;
const gradualRaw = argVal("gradual", CONFIG.gradual);
const gradual  = gradualRaw === true || gradualRaw === "true" || gradualRaw === "1";
const apiUrl   = String(argVal("apiUrl", CONFIG.apiUrl) || CONFIG.apiUrl);

// ---------- 步数生成 ----------
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stepsForNow() {
  if (gradual) {
    const h = new Date().getHours();
    if (h < 11) return rand(6000, 10000);
    if (h < 14) return rand(8000, 14000);
    if (h < 18) return rand(10000, 18000);
    if (h < 21) return rand(12000, 22000);
  }
  return rand(Math.min(minStep, maxStep), Math.max(minStep, maxStep));
}

// ---------- 提交 ----------
function notify(title, body) {
  $notification.post("出去走走", title, body);
}

function finish() {
  $done();
}

if (!account || !password) {
  notify("⚠️ 还没填账号密码", "打开 Loon → 插件 → 出去走走·自动步数, 把账号和密码填上 (只存你手机本地).");
  console.log("[zouzou] account/password empty, abort.");
  finish();
} else {
  const steps = stepsForNow();
  const body =
    "phone=" + encodeURIComponent(account) +
    "&pwd=" + encodeURIComponent(password) +
    "&num=" + steps;

  const req = {
    url: apiUrl,
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Origin": "http://8.140.250.130",
      "Referer": "http://8.140.250.130/bushu/",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body,
  };

  console.log("[zouzou] submit steps=" + steps + " account=" + account);

  $httpClient.post(req, function (error, response, data) {
    if (error) {
      notify("❌ 提交失败 (网络)", String(error));
      console.log("[zouzou] http error: " + error);
      return finish();
    }
    const status = response && response.status ? response.status : 0;
    const raw = String(data || "");
    let result = null;
    try { result = JSON.parse(raw); } catch (e) {}
    let ok = false;
    let msg = "";
    if (result) {
      msg = String(result.data || result.msg || result.message || "");
      if (result.code === 200 || result.code === 0 || result.success === true || /成功|success/i.test(msg)) {
        ok = true;
      }
    } else if (/成功|success|ok/i.test(raw)) {
      ok = true;
      msg = raw.slice(0, 80);
    }
    if (ok && status === 200) {
      notify("✅ 今日步数已提交", steps + " 步" + (msg ? " · " + msg : ""));
      console.log("[zouzou] success http=" + status + " resp=" + raw.slice(0, 300));
    } else {
      notify("❓ 提交结果待确认", "HTTP " + status + " · 步数 " + steps + " · 服务器返回: " + (msg || raw.slice(0, 120) || "(空)"));
      console.log("[zouzou] uncertain http=" + status + " resp=" + raw.slice(0, 300));
    }
    finish();
  });
}
