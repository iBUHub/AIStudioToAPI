# AIStudio To API

中文文档 | [English](README.md)

一个将 Google AI Studio 网页端封装为兼容 OpenAI API 和 Gemini API 的工具。该服务将充当代理，将 API 请求转换为与 AI Studio 网页界面的浏览器交互。

> **鸣谢**：本项目为基于 [Ellinav](https://github.com/Ellinav) 的 [ais2api](https://github.com/Ellinav/ais2api) 分支进行的二次开发，我们对原作者创立这个优秀的项目表示诚挚的感谢。

## ✨ 功能特性

- 🔄 **API 兼容性**：同时兼容 OpenAI API 和 Gemini API 格式
- 🌐 **网页自动化**：使用浏览器自动化技术与 AI Studio 网页界面交互
- 🔐 **身份验证**：基于 API 密钥的安全认证机制
- 🐳 **Docker 支持**：通过 Docker 和 Docker Compose 轻松部署
- 📝 **模型支持**：通过 AI Studio 访问各种 Gemini 模型

## 🚀 快速开始

### 💻 本地运行（仅支持 Windows）

1. 克隆仓库：
```powershell
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. 运行快速设置脚本：
```powershell
npm run setup-auth
```

该脚本将：
- 自动下载 Camoufox 浏览器（一个注重隐私的 Firefox 分支）
- 启动浏览器并自动导航到 AI Studio
- 在本地保存您的身份验证凭据

3. 启动服务：
```powershell
npm install
npm start
```

API 服务将在 `http://localhost:7860` 上运行。

### 🌐 服务器部署（Linux VPS）

在生产环境中部署到服务器（Linux VPS）时，需要先从 Windows 机器中提取身份验证凭据。

#### 📝 步骤 1：提取身份验证凭据（在 Windows 上）

1. 在 Windows 机器上克隆仓库：
```powershell
git clone https://github.com/iBenzene/AIStudioToAPI.git
cd AIStudioToAPI
```

2. 运行设置脚本：
```powershell
npm run setup-auth
```

这将：
- 自动下载 Camoufox 浏览器
- 启动浏览器并自动导航到 AI Studio
- 手动登录你的 Google 账号
- 将身份验证凭据保存到 `configs/auth/auth_N.json`（其中 N 是从 0 开始自动递增的索引）

**工作原理**：脚本使用浏览器自动化技术捕获您的 AI Studio 会话 Cookie 和令牌，并将它们安全地存储在 JSON 文件中。认证文件使用自动递增的索引命名（auth_0.json、auth_1.json 等）以支持多个账户。这样 API 就可以在服务器上进行经过身份验证的请求，而无需交互式登录。

3. 找到身份验证文件：
```powershell
ls configs/auth/auth_*.json
```

4. 将认证文件复制到服务器：
```powershell
scp configs/auth/auth_*.json user@your-server:/path/to/deployment/configs/auth/
```

5. 现在可以从 Windows 机器中删除克隆的仓库了。

#### 🚢 步骤 2：在服务器上部署

##### 🐋 方式 1：Docker 命令

```bash
docker run -d \
  --name aistudio-to-api \
  -p 7860:7860 \
  -v /path/to/auth:/app/configs/auth \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  --restart unless-stopped \
  ghcr.io/ibenzene/aistudio-to-api:latest
```

参数说明：
- `-p 7860:7860`：API 服务器端口（如果使用反向代理，强烈建议改成 127.0.0.1:7860）
- `-v /path/to/auth:/app/configs/auth`：挂载包含认证文件的目录
- `-e API_KEYS`：用于身份验证的 API 密钥列表（使用逗号分隔）

##### 📦 方式 2：Docker Compose

创建 `docker-compose.yml` 文件：

```yaml
name: aistudio-to-api

services:
  app:
    image: ghcr.io/ibenzene/aistudio-to-api:latest
    container_name: aistudio-to-api    
    ports:
      - 7860:7860
    restart: unless-stopped
    volumes:
      - ./auth:/app/configs/auth
    environment:
      API_KEYS: your-api-key-1,your-api-key-2
```

启动服务：
```bash
sudo docker compose up -d
```

查看日志：
```bash
sudo docker compose logs -f
```

停止服务：
```bash
sudo docker compose down
```

##### 🌐 步骤 3（可选）：使用 Nginx 反向代理

如果需要通过域名访问或希望在反向代理层统一管理（例如配置 HTTPS、负载均衡等），可以使用 Nginx。以下是推荐的配置：

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
    }
}
```

启用配置并重启 Nginx：

```bash
# 创建符号链接以启用站点
sudo ln -s /etc/nginx/sites-available/aistudio-api /etc/nginx/sites-enabled/

# 检查一下配置是否正确
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

**提示**：

- 如果配置了 HTTPS，建议设置环境变量 `SECURE_COOKIES=true` 以启用安全 Cookie
- 如果只使用 HTTP，保持 `SECURE_COOKIES=false`（默认值）或不设置此变量
- 必须配置 `X-Real-IP` 和 `X-Forwarded-For` 头以确保服务器能够获取真实客户端 IP

## 📡 使用 API

### 🤖 OpenAI 兼容 API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "你好，最近怎么样？"
      }
    ],
    "stream": false
  }'
```

### ♊ Gemini 原生 API 格式

```bash
curl -X POST http://localhost:7860/proxy/v1beta/models/gemini-2.5-flash-lite:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "你好，最近怎么样？"
          }
        ]
      }
    ]
  }'
```

### 🌊 流式响应

```bash
# OpenAI 兼容 API 流式响应
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "写一首关于秋天的诗"
      }
    ],
    "stream": true
  }'
```

```bash
# Gemini 原生 API 流式响应
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "写一首关于秋天的诗"
          }
        ]
      }
    ]
  }'
```

## ⚙️ 相关配置

### 🔧 环境变量

- `API_KEYS`：用于身份验证的有效 API 密钥列表（使用逗号分隔）
- `PORT`：API 服务器端口（默认：7860）
- `HOST`：服务器监听主机地址（默认：0.0.0.0）
- `SECURE_COOKIES`：是否启用安全 Cookie（HTTPS only）
  - 设置为 `true`：仅 HTTPS 连接可登录（适用于配置了 SSL 证书的生产环境）
  - 设置为 `false` 或不设置：HTTP 和 HTTPS 都可登录（默认，新手友好）
- `ICON_URL`：自定义控制台的 favicon 图标 URL
  - 支持任意图片格式（ICO、PNG、SVG 等）
  - 支持任意尺寸，常见尺寸为 16x16、32x32、48x48（ICO 或 PNG）或矢量图（SVG）
  - 示例：`https://example.com/favicon.ico`
  - 若不设置，则不显示 favicon

### 🧠 模型配置

编辑 `configs/models.json` 以自定义可用模型及其设置。

## 📄 许可证

本项目基于 [**ais2api**](https://github.com/Ellinav/ais2api)（作者：[**Ellinav**](https://github.com/Ellinav)）分支开发，并完全沿用上游项目所采用的 CC BY-NC 4.0 许可证，其使用、分发与修改行为均需遵守原有许可证的全部条款，完整许可的内容请参见 [LICENSE](LICENSE) 文件。

### 版权 / 署名

- 原始作品 Copyright © [Ellinav](https://github.com/Ellinav)
- 修改与新增部分 Copyright © 2024 [iBenzene](https://github.com/iBenzene) 及其他贡献者
