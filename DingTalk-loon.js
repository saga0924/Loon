/**
 * DingTalkDirect for Loon (Custom by JavaScript) v1
 * 按 Tiny 配置改写：HTTPS 走 cloudnproxy.n.shifen.com:443，
 * CONNECT 请求行在目标地址后加 @sjisd.dingtalk.com，
 * 不带 Host 头，不带 User-Agent，不带 TLS。
 * HTTP 明文那段（直连 + 假 Host）不单独处理：
 * 明文请求同样走 CONNECT 隧道，网关建好 TCP 隧道后原请求直接通过，
 * 运营商在 CONNECT 行里一样能看到 sjisd.dingtalk.com；
 * 实测双 Host 头会被部分服务器拒掉（example.com 返回 530），走隧道更稳。
 * Muse 已实测：该握手返回 200，隧道内打开 example.com / 百度均正常。
 *
 * Loon 节点写法（[Proxy] 段）：
 * 钉钉直连 = custom,cloudnproxy.n.shifen.com,443,script-path=https://raw.githubusercontent.com/saga0924/Loon/main/DingTalk-loon.js
 */

let STATUS_INVALID = -1
let STATUS_CONNECTED = 0
let STATUS_WAITRESPONSE = 1
let STATUS_FORWARDING = 2
var httpStatus = STATUS_INVALID

function tunnelDidConnected() {
    console.log($session)
    if ($session.proxy.isTLS) {
        // 本节点不启用 TLS，正常不会走到这里
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
        // 第一包响应即视为握手成功，不检查状态码
        console.log("dingtalk direct handshake success")
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

// CONNECT 目标地址@sjisd.dingtalk.com，无 Host 头
function _writeHttpHeader() {
    let conHost = $session.conHost
    let conPort = $session.conPort

    var header = `CONNECT ${conHost}:${conPort}@sjisd.dingtalk.com HTTP/1.1\r\n\r\n`
    $tunnel.write($session, header)
}
