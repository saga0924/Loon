/**
 * BaiduDirect for Loon (Custom by JavaScript) v2
 * 按论坛实测配置改写：服务器 180.101.50.208:443，
 * CONNECT 请求行在目标地址后加 @dm.wo.com.cn:18080，
 * 不带 Host 头（Del Host），不带自定义请求头、不带 TLS。
 * Muse 已实测：该握手返回 200，隧道内打开 example.com / 苹果官网均正常。
 *
 * Loon 节点写法（[Proxy] 段）：
 * 百度直连 = custom,180.101.50.208,443,script-path=https://raw.githubusercontent.com/saga0924/Loon/main/BaiduDirect-loon.js
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

// CONNECT 目标地址@dm.wo.com.cn:18080，无 Host 头
function _writeHttpHeader() {
    let conHost = $session.conHost
    let conPort = $session.conPort

    var header = `CONNECT ${conHost}:${conPort}@dm.wo.com.cn:18080 HTTP/1.1\r\n\r\n`
    $tunnel.write($session, header)
}
