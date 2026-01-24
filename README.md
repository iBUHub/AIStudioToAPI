# Google AI Studio to API Adapter

中文文档 | [English](README_EN.md)

一个将 Google AI Studio 网页端封装为兼容 OpenAI API 和 Gemini API 的工具。该服务将充当代理，将 API 请求转换为与 AI Studio 网页界面的浏览器交互。

## ✨ 功能特性

- 🔄 **API 兼容性**：同时兼容 OpenAI API 和 Gemini API 格式
- 🌐 **网页自动化**：使用浏览器自动化技术与 AI Studio 网页界面交互
- 🔐 **身份验证**：基于 API 密钥的安全认证机制
- 🔧 **支持工具调用**：OpenAI 和 Gemini 接口均支持 Tool Calls (Function Calling)
- 📝 **模型支持**：通过 AI Studio 访问各种 Gemini 模型，包括生图模型和 TTS 语音合成模型
- 🎨 **主页展示控制**：提供可视化的 Web 控制台，支持账号管理、VNC 登录等操作

## 🚀 快速开始

### 💻 直接运行（Windows / macOS / Linux）

1. 克隆仓库：

   ```bash
   git clone https://github.com/iBUHub/AIStudioToAPI.git
   cd AIStudioToAPI
   ```

2. 运行快速设置脚本：

   ```bash
   npm run setup-auth
   ```

   该脚本将：
   - 自动下载 Camoufox 浏览器（一个注重隐私的 Firefox 分支）
   - 启动浏览器并自动导航到 AI Studio
   - 在本地保存您的身份验证凭据

3. 配置环境变量（可选）：

   复制根目录下的 `.env.example` 为 `.env`，并在 `.env` 中按需修改配置（如端口、API 密钥等）。

4. 启动服务：

   ```bash
   npm start
   ```

   API 服务将在 `http://localhost:7860` 上运行。

   服务启动后，您可以在浏览器中访问 `http://localhost:7860` 打开 Web 控制台主页，在这里可以查看账号状态和服务状态。

> ⚠ **注意：** 直接运行不支持通过 VNC 在线添加账号，需要使用 `npm run setup-auth` 脚本添加账号。当前 VNC 登录功能仅在 Docker 容器中可用。

### 🐋 Docker 部署

使用 Docker 部署，无需预先提取身份验证凭据。

#### 🚢 步骤 1：部署容器

##### 🎮️ 方式 1：Docker 命令

```bash
docker run -d \
  --name aistudio-to-api \
  -p 7860:7860 \
  -v /path/to/auth:/app/configs/auth \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  ghcr.io/ibuhub/aistudio-to-api:latest
```

> 💡 **提示：** 如果 `ghcr.io` 访问速度较慢或不可用，可以使用 Docker Hub 镜像：`ibuhub/aistudio-to-api:latest`。

参数说明：

- `-p 7860:7860`：API 服务器端口（如果使用反向代理，强烈建议改成 127.0.0.1:7860）
- `-v /path/to/auth:/app/configs/auth`：挂载包含认证文件的目录
- `-e API_KEYS`：用于身份验证的 API 密钥列表（使用逗号分隔）
- `-e TZ=Asia/Shanghai`：时区设置（可选，默认使用系统时区）

##### 📦 方式 2：Docker Compose

创建 `docker-compose.yml` 文件：

```yaml
name: aistudio-to-api

services:
  app:
    image: ghcr.io/ibuhub/aistudio-to-api:latest
    container_name: aistudio-to-api
    ports:
      - 7860:7860
    restart: unless-stopped
    volumes:
      - ./auth:/app/configs/auth
    environment:
      API_KEYS: your-api-key-1,your-api-key-2
      TZ: Asia/Shanghai # 日志时区设置（可选）
```

> 💡 **提示：** 如果 `ghcr.io` 访问速度较慢或不可用，可以将 `image` 改为 `ibuhub/aistudio-to-api:latest`。

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

**代理配置（可选）：** 如需使用代理访问 Google 服务，在 Docker 命令中添加 `-e HTTP_PROXY=http://your-proxy:port -e HTTPS_PROXY=http://your-proxy:port`，或在 `docker-compose.yml` 的 `environment` 中添加这两个环境变量。

##### 🛠️ 方式 3：从源码构建

如果您希望自己构建 Docker 镜像，可以使用以下命令：

1. 构建镜像：

   ```bash
   docker build -t aistudio-to-api .
   ```

2. 运行容器：

   ```bash
   docker run -d \
     --name aistudio-to-api \
     -p 7860:7860 \
     -v /path/to/auth:/app/configs/auth \
     -e API_KEYS=your-api-key-1,your-api-key-2 \
     -e TZ=Asia/Shanghai \
     --restart unless-stopped \
     aistudio-to-api
   ```

#### 🔑 步骤 2：账号管理

部署后，您需要使用以下方式之一添加 Google 账号：

**方法 1：VNC 登录（推荐）**

- 在浏览器中访问部署的服务地址（例如 `http://your-server:7860`）并点击「添加账号」按钮
- 将跳转到 VNC 页面，显示浏览器实例
- 登录您的 Google 账号，登录完成后点击「保存」按钮
- 账号将自动保存为 `auth-N.json`（N 从 0 开始）

**方法 2：上传认证文件**

- 在本地机器上运行 `npm run setup-auth` 生成认证文件
- 在网页控制台，点击「上传 Auth」，上传 auth 的 JSON 文件，或手动上传到挂载的 `/path/to/auth` 目录

> 💡 **提示**：您也可以从已有的容器下载 auth 文件，然后上传到新的容器。在网页控制台点击对应账号的「下载 Auth」按钮即可下载 auth 文件。

> ⚠ 目前暂不支持通过环境变量注入认证信息。

#### 🌐 步骤 3（可选）：使用 Nginx 反向代理

如果需要通过域名访问或希望在反向代理层统一管理（例如配置 HTTPS、负载均衡等），可以使用 Nginx。

> 📖 详细的 Nginx 配置说明请参阅：[Nginx 反向代理配置文档](docs/zh/nginx-setup.md)

### 🐾 Claw Cloud Run 部署

支持直接部署到 Claw Cloud Run，全托管的容器平台。

> 📖 详细部署说明请参阅：[部署到 Claw Cloud Run](docs/zh/claw-cloud-run.md)

### 🦓 Zeabur 部署

支持部署到 Zeabur 容器平台。

> ⚠ **注意：** Zeabur 的免费额度每月仅 5 美元，不足以支持 24 小时运行。不使用时请务必暂停服务！

> 📖 详细部署说明请参阅：[部署到 Zeabur](docs/zh/zeabur.md)

## 📡 使用 API

### 🤖 OpenAI 兼容 API

此端点处理后转发到官方 Gemini API 格式端点。

- `GET /v1/models`: 列出模型。
- `POST /v1/chat/completions`: 聊天补全和图片生成，支持非流式、真流式和假流式。

### ♊ Gemini 原生 API 格式

此端点转发到官方 Gemini API 格式端点。

- `GET /v1beta/models`: 列出可用的 Gemini 模型。
- `POST /v1beta/models/{model_name}:generateContent`: 生成内容、图片和语音。
- `POST /v1beta/models/{model_name}:streamGenerateContent`: 流式生成内容、图片和语音，支持真流式和假流式。
- `POST /v1beta/models/{model_name}:batchEmbedContents`: 批量生成文本嵌入向量。

> 📖 详细的 API 使用示例请参阅：[API 使用示例文档](docs/zh/api-examples.md)

## 🧰 相关配置

### 🔧 环境变量

#### 📱 应用配置

| 变量名                      | 描述                                                          | 默认值               |
| :-------------------------- | :------------------------------------------------------------ | :------------------- |
| `API_KEYS`                  | 用于身份验证的有效 API 密钥列表（使用逗号分隔）。             | `123456`             |
| `PORT`                      | API 服务器端口。                                              | `7860`               |
| `HOST`                      | 服务器监听的主机地址。                                        | `0.0.0.0`            |
| `ICON_URL`                  | 用于自定义控制台的 favicon 图标。支持 ICO, PNG, SVG 等格式。  | `/AIStudio_logo.svg` |
| `SECURE_COOKIES`            | 是否启用安全 Cookie。`true` 表示仅支持 HTTPS 协议访问控制台。 | `false`              |
| `RATE_LIMIT_MAX_ATTEMPTS`   | 时间窗口内控制台允许的最大失败登录尝试次数（设为 `0` 禁用）。 | `5`                  |
| `RATE_LIMIT_WINDOW_MINUTES` | 速率限制的时间窗口长度（分钟）。                              | `15`                 |
| `CHECK_UPDATE`              | 是否在页面加载时检查版本更新。设为 `false` 可禁用。           | `true`               |
| `LOG_LEVEL`                 | 日志输出等级。设为 `DEBUG` 启用详细调试日志。                 | `INFO`               |

#### 🌐 代理配置

| 变量名                          | 描述                                                                                                                       | 默认值    |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------------------- | :-------- |
| `INITIAL_AUTH_INDEX`            | 启动时使用的初始身份验证索引。                                                                                             | `0`       |
| `ENABLE_AUTH_UPDATE`            | 是否启用自动保存凭证更新。默认为启用状态，将在每次登录/切换账号成功时以及每 24 小时自动更新 auth 文件。设为 `false` 禁用。 | `true`    |
| `MAX_RETRIES`                   | 请求失败后的最大重试次数（仅对假流式和非流式生效）。                                                                       | `3`       |
| `RETRY_DELAY`                   | 两次重试之间的间隔（毫秒）。                                                                                               | `2000`    |
| `SWITCH_ON_USES`                | 自动切换帐户前允许的请求次数（设为 `0` 禁用）。                                                                            | `40`      |
| `FAILURE_THRESHOLD`             | 切换帐户前允许的连续失败次数（设为 `0` 禁用）。                                                                            | `3`       |
| `IMMEDIATE_SWITCH_STATUS_CODES` | 触发立即切换帐户的 HTTP 状态码（逗号分隔）。                                                                               | `429,503` |

#### 🗒️ 其他配置

| 变量名              | 描述                                             | 默认值  |
| :------------------ | :----------------------------------------------- | :------ |
| `STREAMING_MODE`    | 流式传输模式。`real` 为真流式，`fake` 为假流式。 | `real`  |
| `FORCE_THINKING`    | 强制为所有请求启用思考模式。                     | `false` |
| `FORCE_WEB_SEARCH`  | 强制为所有请求启用网络搜索。                     | `false` |
| `FORCE_URL_CONTEXT` | 强制为所有请求启用 URL 上下文。                  | `false` |

### 🧠 模型列表配置

编辑 `configs/models.json` 以自定义可用模型及其设置。

## 📄 许可证

本项目基于 [**ais2api**](https://github.com/Ellinav/ais2api)（作者：[**Ellinav**](https://github.com/Ellinav)）分支开发，并完全沿用上游项目所采用的 CC BY-NC 4.0 许可证，其使用、分发与修改行为均需遵守原有许可证的全部条款，完整许可的内容请参见 [LICENSE](LICENSE) 文件。

## 🤝 贡献者

[![Contributors](https://contrib.rocks/image?repo=iBUHub/AIStudioToAPI)](https://github.com/iBUHub/AIStudioToAPI/graphs/contributors)

感谢所有为本项目付出汗水与智慧的开发者。
