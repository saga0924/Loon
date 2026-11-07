/*
 * 出去走走 · 提交抓包 (Loon http-request 脚本)
 * ------------------------------------------------------------
 * 作用: 当你在浏览器里打开提交页面并点「出去走走」时,
 * 把那次真实提交请求的方法/地址/参数记录到 Loon 日志,
 * 用来确认这个镜像站真正的提交接口. 只记录, 不修改请求.
 * 日志里会包含你填的密码 — 截图发出去之前请把密码值涂掉.
 */

try {
  const url = $request.url || "";
  const method = $request.method || "";
  const headers = $request.headers || {};
  let body = $request.body || "";
  if (typeof body !== "string") {
    try { body = JSON.stringify(body); } catch (e) { body = String(body); }
  }
  if (!body && $request.bodyBytes) {
    try {
      const bytes = new Uint8Array($request.bodyBytes);
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      body = decodeURIComponent(escape(s));
    } catch (e) {
      console.log("[CQZZ-CAPTURE] bodyBytes decode error: " + e);
    }
  }

  const interesting =
    /bushu|motion|Xiaomi|submit|step|zouzou|cqzz/i.test(url) ||
    (method === "POST" && body.length > 0);

  if (interesting) {
    console.log("[CQZZ-CAPTURE] ================================");
    console.log("[CQZZ-CAPTURE] " + method + " " + url);
    console.log("[CQZZ-CAPTURE] Content-Type: " + (headers["Content-Type"] || headers["content-type"] || ""));
    console.log("[CQZZ-CAPTURE] BODY: " + body);
    console.log("[CQZZ-CAPTURE] ================================");
    $notification.post("🎯 抓到提交请求", method + " 请求已记入 Loon 日志", url.slice(0, 120));
  }
} catch (e) {
  console.log("[CQZZ-CAPTURE] error: " + e);
}

$done({});
