/**
 * BaiduDirect for Loon (Custom by JavaScript)
 * 由 BaiduDirect.lua.lua 改写，行为与 Lua 版一致：
 * 握手时向代理 153.3.237.117:443 发送自定义 CONNECT 请求，
 * Host 写死 153.3.236.22:443，带 X-T5-Auth 和百度 App 的 User-Agent，
 * 代理返回第一包后即认为握手成功，之后数据直接透传。
 *
 * Loon 节点写法（[Proxy] 段）：
 * 百度直连 = custom,153.3.237.117,443,script-path=BaiduDirect-loon.js
 *
 * 注意：CONNECT 行按 Lua 原版保留“端口后无空格直接接 HTTP/1.1”的写法，
 * 这是给网关看的。若测试不通，把下面 header 里
 * ${conPort}HTTP/1.1 改成 ${conPort} HTTP/1.1（加一个空格）再试。
 */

let STATUS_INVALID = -1
let STATUS_CONNECTED = 0
let STATUS_WAITRESPONSE = 1
let STATUS_FORWARDING = 2
var httpStatus = STATUS_INVALID

function tunnelDidConnected() {
    console.log($session)
    if ($session.proxy.isTLS) {
        // https 代理走 TLS 握手，握手完成后再发 CONNECT，见 tunnelTLSFinished
    } else {
        _writeHttpHeader()
        httpStatus = STATUS_CONNECTED
    }
    return true
}

function tunnelTLSFinished() {
    _writeHttpHeader()
    httpStatus = STATUS_CONNECTED
    return true
}

function tunnelDidRead(data) {
    if (httpStatus == STATUS_WAITRESPONSE) {
        // 与 Lua 版一致：第一包响应即视为握手成功，不检查状态码
        console.log("baidu direct handshake success")
        httpStatus = STATUS_FORWARDING
        $tunnel.established($session)
        return null // 握手响应不转发给客户端
    } else if (httpStatus == STATUS_FORWARDING) {
        return data
    }
}

function tunnelDidWrite() {
    if (httpStatus == STATUS_CONNECTED) {
        console.log("write http head success")
        httpStatus = STATUS_WAITRESPONSE
        $tunnel.readTo($session, "\x0D\x0A\x0D\x0A") // 读到 \r\n\r\n 为止
        return false
    }
    return true
}

function tunnelDidClose() {
    return true
}

// 发送与 Lua 版 wa_lua_on_handshake_cb 完全一致的 CONNECT 请求
function _writeHttpHeader() {
    let conHost = $session.conHost
    let conPort = $session.conPort

    var header = `CONNECT ${conHost}:${conPort}HTTP/1.1\r\nHost: 153.3.236.22:443\r\nUser-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 15_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1 baiduboxapp\r\nProxy-Connection: Keep-Alive\r\nX-T5-Auth: 683556433\r\n\r\n`
    $tunnel.write($session, header)
}
