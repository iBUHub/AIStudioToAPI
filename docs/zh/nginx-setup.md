# Nginx 反向代理配置

如果需要通过域名访问或希望在反向代理层统一管理（例如配置 HTTPS、负载均衡等），可以使用 Nginx。

## 🚀 快速开始

创建 Nginx 配置文件 `/etc/nginx/sites-available/aistudio-api`：

```nginx
server {
    listen 80;
    listen [::]:80;  # IPv6 支持
    server_name your-domain.com;  # 替换为你的域名

    # 如果使用 HTTPS，取消注释以下行并配置 SSL 证书
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;  # IPv6 HTTPS
    # ssl_certificate /path/to/your/certificate.crt;
    # ssl_certificate_key /path/to/your/private.key;

    # 客户端请求体大小的限制（0 = 不限制）
    client_max_body_size 0;

    location / {
        # 反向代理到 Docker 容器
        proxy_pass http://127.0.0.1:7860;

        # X-Real-IP: 传递真实客户端 IP
        proxy_set_header X-Real-IP $remote_addr;

        # X-Forwarded-For: 包含完整的代理链
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 其他必要的代理头
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置（适配长时间运行的 AI 请求）
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        # 禁用缓冲区以支持流式响应
        proxy_buffering off;

	    # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

### 🟢 启用配置

```bash
# 创建符号链接以启用站点
sudo ln -s /etc/nginx/sites-available/aistudio-api /etc/nginx/sites-enabled/

# 检查一下配置是否正确
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

## 🚨 注意事项

### 🌐 多层代理配置

**⚠ 重要**：如果使用多层 Nginx 代理（例如：客户端 -> 公网网关 -> 内网网关 -> 应用），仅在 **最外层公网入口** 使用 `proxy_set_header X-Real-IP $remote_addr` 即可，内层代理使用 `$http_x_real_ip` 透传，**不应覆盖** `X-Real-IP`：

```nginx
# 内层 Nginx（内网网关）配置示例
location / {
    proxy_pass http://127.0.0.1:7860;

    # 关键：透传上游的 X-Real-IP，不要用 $remote_addr 覆盖
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # 其他必要的代理头
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 超时设置
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;

    # 禁用缓冲区
    proxy_buffering off;

	# WebSocket 支持
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
```

### 🍪 安全 Cookie 设置

- 如果配置了 HTTPS，建议设置环境变量 `SECURE_COOKIES=true` 以启用安全 Cookie
- 如果只使用 HTTP，保持 `SECURE_COOKIES=false`（默认值）或不设置此变量
