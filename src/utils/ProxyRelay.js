/**
 * File: src/utils/ProxyRelay.js
 * Description: Local credential-injecting relay for authenticated HTTP proxies
 */

const http = require("http");
const https = require("https");
const net = require("net");
const tls = require("tls");

const CONNECT_TIMEOUT_MS = 15000;
const MAX_PROXY_HEADER_BYTES = 64 * 1024;
const HTTP_PROXY_PROTOCOLS = new Set(["http:", "https:"]);
const BAD_GATEWAY = "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
const HOP_HEADERS = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
];

class ProxyAuthRelay {
    constructor(logger) {
        this.logger = logger;
        this.relays = new Map();
        this.closed = false;
        this.closePromise = null;
    }

    async resolve(proxyConfig) {
        if (!this._needsRelay(proxyConfig)) return proxyConfig;

        const upstream = this._parseUpstream(proxyConfig);
        if (this.closed) throw this._relayError(upstream, "relay has already been closed");

        const key = this._getRelayKey(upstream);
        let relayPromise = this.relays.get(key);
        if (!relayPromise) {
            relayPromise = this._startRelay(upstream);
            this.relays.set(key, relayPromise);
            relayPromise.catch(() => {
                if (this.relays.get(key) === relayPromise) this.relays.delete(key);
            });
        }

        const relay = await relayPromise;
        // Shutdown may have started while the ephemeral listener was binding.
        if (this.closed) throw this._relayError(upstream, "relay has already been closed");
        const resolvedProxy = { server: `http://127.0.0.1:${relay.port}` };
        if (proxyConfig.bypass) resolvedProxy.bypass = proxyConfig.bypass;
        return resolvedProxy;
    }

    closeAll() {
        if (!this.closePromise) {
            this.closed = true;
            this.closePromise = (async () => {
                const settled = await Promise.allSettled([...this.relays.values()]);
                await Promise.all(
                    settled.filter(result => result.status === "fulfilled").map(result => result.value.close())
                );
                this.relays.clear();
            })();
        }
        return this.closePromise;
    }

    _needsRelay(proxyConfig) {
        if (!proxyConfig || (!proxyConfig.username && !proxyConfig.password)) return false;
        if (
            (proxyConfig.username !== undefined && typeof proxyConfig.username !== "string") ||
            typeof proxyConfig.server !== "string"
        ) {
            throw new Error("Invalid authenticated proxy configuration");
        }
        try {
            return HTTP_PROXY_PROTOCOLS.has(new URL(proxyConfig.server).protocol);
        } catch {
            throw new Error("Invalid authenticated proxy URL");
        }
    }

    _parseUpstream(proxyConfig) {
        const parsed = new URL(proxyConfig.server);
        const protocol = parsed.protocol;
        const port = Number(parsed.port || (protocol === "https:" ? 443 : 80));
        if (
            !parsed.hostname ||
            port < 1 ||
            port > 65535 ||
            parsed.username ||
            parsed.password ||
            (proxyConfig.password !== undefined && typeof proxyConfig.password !== "string")
        ) {
            throw new Error("Invalid authenticated proxy address or credentials");
        }

        return {
            authHeader: `Basic ${Buffer.from(`${proxyConfig.username || ""}:${proxyConfig.password || ""}`).toString("base64")}`,
            // WHATWG URL includes brackets; net/tls expect the bare IPv6 address.
            hostname: parsed.hostname.replace(/^\[|\]$/g, ""),
            password: proxyConfig.password || "",
            port,
            protocol,
            username: proxyConfig.username || "",
        };
    }

    _getRelayKey(upstream) {
        return JSON.stringify([
            upstream.protocol,
            upstream.hostname,
            upstream.port,
            upstream.username,
            upstream.password,
        ]);
    }

    _display(upstream) {
        const host = net.isIP(upstream.hostname) === 6 ? `[${upstream.hostname}]` : upstream.hostname;
        return `${host}:${upstream.port}`;
    }

    _startRelay(upstream) {
        const Agent = upstream.protocol === "https:" ? https.Agent : http.Agent;
        const state = {
            activeSockets: new Set(),
            agent: new Agent({ keepAlive: true, maxFreeSockets: 8, maxSockets: 64 }),
            authHeader: upstream.authHeader,
            closing: false,
            display: this._display(upstream),
            server: null,
            upstream,
        };
        const server = http.createServer((request, response) => this._handleHttpRequest(state, request, response));
        state.server = server;
        server.on("connect", (request, socket, head) => this._handleConnect(state, request, socket, head));
        // Plain ws:// Upgrade is intentionally unsupported; never leave it hanging.
        // HTTPS and wss:// continue to work as opaque CONNECT tunnels.
        server.on("upgrade", (request, socket) => {
            socket.once("error", () => socket.destroy());
            socket.end("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        });
        server.on("connection", socket => this._trackSocket(state, socket));
        server.on("clientError", (error, socket) => {
            this._warn(state, "client protocol error", error);
            socket.destroy();
        });
        server.on("error", error => this._warn(state, "listener error", error));

        return new Promise((resolve, reject) => {
            const onError = error => {
                server.removeListener("listening", onListening);
                reject(this._relayError(upstream, error.message));
            };
            const onListening = () => {
                server.removeListener("error", onError);
                const address = server.address();
                if (!address || typeof address === "string") {
                    server.close();
                    reject(this._relayError(upstream, "listener address is unavailable"));
                    return;
                }
                this.logger?.info?.(`[ProxyRelay] 127.0.0.1:${address.port} -> ${state.display}`);
                resolve({ close: () => this._closeRelay(state), port: address.port });
            };
            server.once("error", onError);
            server.once("listening", onListening);
            try {
                server.listen(0, "127.0.0.1");
            } catch (error) {
                this._warn(state, "listener error", error);
                onError(error);
            }
        });
    }

    _handleConnect(state, request, clientSocket, clientHead) {
        let upstreamSocket;
        let established = false;
        let failed = false;
        clientSocket.pause();
        clientSocket.allowHalfOpen = true;
        // One deadline covers DNS, TCP, TLS verification and the proxy response.
        const timer = setTimeout(() => fail(new Error("upstream handshake timed out")), CONNECT_TIMEOUT_MS);
        const fail = error => {
            if (failed) return;
            failed = true;
            clearTimeout(timer);
            upstreamSocket?.destroy();
            if (clientSocket.destroyed) return;
            this._warn(state, "upstream tunnel error", error);
            if (established) clientSocket.destroy();
            else if (!clientSocket.destroyed) clientSocket.end(BAD_GATEWAY);
        };
        clientSocket.once("error", () => {
            clearTimeout(timer);
            upstreamSocket?.destroy();
            clientSocket.destroy();
        });
        clientSocket.once("close", () => {
            clearTimeout(timer);
            upstreamSocket?.destroy();
        });
        clientSocket.once("end", () => {
            if (!established) {
                clearTimeout(timer);
                upstreamSocket?.destroy();
                clientSocket.destroy();
            }
        });

        try {
            upstreamSocket = this._connectToUpstream(state.upstream);
        } catch (error) {
            fail(error);
            return;
        }
        this._trackSocket(state, upstreamSocket);
        upstreamSocket.once("error", fail);
        upstreamSocket.once("close", () => {
            // A normal EOF is handled by pipe/end, which flushes queued writes.
            // Destroying the client here would truncate a backpressured tail.
            if (!failed && !upstreamSocket.readableEnded && !clientSocket.destroyed) {
                fail(new Error("upstream connection closed unexpectedly"));
            }
        });
        const readyEvent = state.upstream.protocol === "https:" ? "secureConnect" : "connect";
        upstreamSocket.once(readyEvent, () => {
            if (clientSocket.destroyed || failed) return;
            upstreamSocket.write(this._buildConnectRequest(request, state.authHeader));
            this._readProxyResponse(upstreamSocket)
                .then(({ remainder, statusCode }) => {
                    if (failed || clientSocket.destroyed) return;
                    if (statusCode !== 200) {
                        // Never expose upstream headers/body, especially a 407 challenge.
                        fail(new Error(`upstream proxy rejected CONNECT (status ${statusCode})`));
                        return;
                    }
                    established = true;
                    clearTimeout(timer);
                    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
                    if (clientHead.length) upstreamSocket.write(clientHead);
                    if (remainder.length) clientSocket.write(remainder);
                    clientSocket.pipe(upstreamSocket);
                    upstreamSocket.pipe(clientSocket);
                })
                .catch(fail);
        });
    }

    _handleHttpRequest(state, request, response) {
        let upstreamRequest;
        let upstreamResponse;
        let finished = false;
        const timer = setTimeout(() => fail(new Error("upstream request timed out")), CONNECT_TIMEOUT_MS);
        const cancel = () => {
            finished = true;
            clearTimeout(timer);
            upstreamResponse?.destroy();
            upstreamRequest?.destroy();
        };
        const fail = error => {
            if (finished) return;
            this._warn(state, "upstream request error", error);
            cancel();
            if (response.headersSent) {
                response.destroy();
            } else {
                response.writeHead(502, { connection: "close", "content-length": "0" });
                response.end();
            }
        };
        // IncomingMessage 'close' also fires for a successfully received GET.
        // The response owns cancellation after that point, not the request.
        response.once("close", () => {
            if (!response.writableFinished) cancel();
            else {
                finished = true;
                clearTimeout(timer);
            }
        });
        response.once("error", cancel);
        request.once("aborted", cancel);
        request.once("error", cancel);

        const headers = this._stripHopHeaders(request.headers);
        headers["proxy-authorization"] = state.authHeader;
        const requestOptions = {
            agent: state.agent,
            headers,
            hostname: state.upstream.hostname,
            method: request.method,
            path: this._getHttpRequestPath(request),
            port: state.upstream.port,
            servername: net.isIP(state.upstream.hostname) ? "" : state.upstream.hostname,
        };
        try {
            const requestModule = state.upstream.protocol === "https:" ? https : http;
            upstreamRequest = requestModule.request(requestOptions, incoming => {
                upstreamResponse = incoming;
                clearTimeout(timer);
                incoming.once("error", fail);
                incoming.once("aborted", () => fail(new Error("upstream response aborted")));
                incoming.once("close", () => {
                    if (!incoming.complete) fail(new Error("upstream response closed prematurely"));
                });
                if (finished) {
                    incoming.destroy();
                    return;
                }
                if (incoming.statusCode === 407) {
                    fail(new Error("upstream proxy rejected HTTP authentication"));
                    return;
                }
                const responseHeaders = this._stripHopHeaders(incoming.headers);
                // Suppress echoed proxy authorization, not arbitrary origin metadata.
                // A short username/password can occur in Content-Type or Content-Encoding.
                for (const [name, value] of Object.entries(responseHeaders)) {
                    if (String(value).includes(state.authHeader)) delete responseHeaders[name];
                }
                response.writeHead(incoming.statusCode || 502, responseHeaders);
                incoming.pipe(response);
            });
            this._trackSocket(state, upstreamRequest);
            upstreamRequest.once("socket", socket => this._trackSocket(state, socket));
            upstreamRequest.once("error", fail);
            upstreamRequest.once("upgrade", (incoming, socket) => {
                socket.destroy();
                fail(new Error("upstream protocol upgrade is unsupported"));
            });
            // The absolute setup timer covers TCP, TLS and response headers only.
            // Once headers arrive, valid slow streams may remain idle indefinitely.
            request.pipe(upstreamRequest);
        } catch (error) {
            fail(error);
        }
    }

    _stripHopHeaders(headers) {
        const result = { ...headers };
        const nominated = String(headers.connection || "").split(",");
        for (const name of [...HOP_HEADERS, ...nominated]) delete result[name.trim().toLowerCase()];
        return result;
    }

    _getHttpRequestPath(request) {
        const requestUrl = request.url || "/";
        if (/^https?:\/\//i.test(requestUrl)) return requestUrl;
        return `http://${request.headers.host || ""}${requestUrl}`;
    }

    _connectToUpstream(upstream) {
        const options = { host: upstream.hostname, port: upstream.port };
        return upstream.protocol === "https:"
            ? tls.connect({ ...options, servername: net.isIP(upstream.hostname) ? "" : upstream.hostname })
            : net.connect(options);
    }

    _buildConnectRequest(request, authHeader) {
        return [
            `CONNECT ${request.url} HTTP/1.1`,
            `Host: ${request.url}`,
            `Proxy-Authorization: ${authHeader}`,
            "Proxy-Connection: keep-alive",
            "\r\n",
        ].join("\r\n");
    }

    _readProxyResponse(socket) {
        return new Promise((resolve, reject) => {
            let received = Buffer.alloc(0);
            const finish = (error, result) => {
                socket.removeListener("data", onData);
                socket.removeListener("error", onError);
                socket.removeListener("end", onEnd);
                socket.removeListener("close", onEnd);
                socket.pause();
                if (error) reject(error);
                else resolve(result);
            };
            const onData = chunk => {
                received = Buffer.concat([received, chunk]);
                const headerEnd = received.indexOf("\r\n\r\n");
                const headerBytes = headerEnd === -1 ? received.length : headerEnd + 4;
                // Payload may arrive in the same chunk; it is not part of the limit.
                if (headerBytes > MAX_PROXY_HEADER_BYTES) {
                    finish(new Error("upstream response header is too large"));
                    return;
                }
                if (headerEnd === -1) return;
                const lines = received.subarray(0, headerEnd).toString("latin1").split("\r\n");
                const status = /^HTTP\/1\.[01] ([1-5]\d{2})(?: [\t\x20-\x7e\x80-\xff]*)?$/.exec(lines.shift());
                const validHeaders = lines.every(line => /^[!#$%&'*+.^_`|~\w-]+:[\t\x20-\x7e\x80-\xff]*$/.test(line));
                if (!status || !validHeaders) {
                    finish(new Error("invalid upstream proxy response"));
                    return;
                }
                finish(null, { remainder: received.subarray(headerBytes), statusCode: Number(status[1]) });
            };
            const onError = error => finish(error);
            const onEnd = () => finish(new Error("upstream closed before sending a response"));
            socket.on("data", onData);
            socket.once("error", onError);
            socket.once("end", onEnd);
            socket.once("close", onEnd);
        });
    }

    _trackSocket(state, socket) {
        if (state.activeSockets.has(socket)) return;
        state.activeSockets.add(socket);
        socket.once("close", () => state.activeSockets.delete(socket));
        if (state.closing) socket.destroy();
    }

    _closeRelay(state) {
        state.closing = true;
        const closed = [...state.activeSockets].map(
            socket =>
                new Promise(resolve => {
                    socket.once("close", resolve);
                    socket.destroy();
                })
        );
        state.agent.destroy();
        closed.push(new Promise(resolve => state.server.close(resolve)));
        return Promise.all(closed);
    }

    _sanitize(upstream, message) {
        const secrets = [upstream.authHeader, upstream.authHeader.slice(6), upstream.username, upstream.password]
            .filter(Boolean)
            .flatMap(value => [value, encodeURIComponent(value)])
            .sort((a, b) => b.length - a.length);
        let safe = String(message);
        for (const secret of secrets) safe = safe.split(secret).join("[redacted]");
        return safe.replace(/Basic\s+[a-z\d+/=]+/gi, "Basic [redacted]").replace(/[\r\n]/g, " ");
    }

    _relayError(upstream, message) {
        return new Error(`[ProxyRelay] ${this._display(upstream)}: ${this._sanitize(upstream, message)}`);
    }

    _warn(state, context, error) {
        this.logger?.warn?.(
            `[ProxyRelay] ${context} for ${state.display}: ${this._sanitize(state.upstream, error.message)}`
        );
    }
}

module.exports = ProxyAuthRelay;
