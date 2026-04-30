# Google AI Studio to API Adapter

中文文档 | [English](README_EN.md)

一个将 Google AI Studio 网页端封装为兼容 OpenAI API、Gemini API 和 Anthropic API 的工具。该服务将充当代理，将 API 请求转换为与 AI Studio 网页界面的浏览器交互。

## ✨ 功能特性

- 🔄 **API 兼容性**：同时兼容 OpenAI API、Gemini API 和 Anthropic API 格式
- 🌐 **网页自动化**：使用浏览器自动化技术与 AI Studio 网页界面交互
- 👥 **多账号支持**：支持多个 Google 账号同时登录，快速切换无需重新登录
- 🔧 **支持工具调用**：OpenAI、Gemini 和 Anthropic 接口均支持 Tool Calls (Function Calling)
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

   无交互模式示例：

   ```bash
   npm run setup-auth -- --non-interactive --email your-email@gmail.com --password your-password --headless
   ```

   如果账号启用了基于 TOTP 的 2FA，也可以在开始时直接带上密钥：

   ```bash
   npm run setup-auth -- --non-interactive --email your-email@gmail.com --password your-password --totp-secret your-base32-secret --headless
   ```

   如果您已经配置了 `users.csv`，也可以直接选择其中一个账号而不进入交互：

   ```bash
   npm run setup-auth -- --non-interactive --account 1
   ```

   该脚本将：
   - 自动下载 Camoufox 浏览器（一个注重隐私的 Firefox 分支）
   - 启动浏览器并自动导航到 AI Studio
   - 首次进入 AI Studio 时，尽量自动点击协议确认弹窗
   - 在本地保存您的身份验证凭据（auth 文件位于 `/configs/auth`）

   > 💡 **提示：** 如果下载 Camoufox 浏览器失败或等待太久，可以自行点击 [此处](https://github.com/daijro/camoufox/releases/tag/v135.0.1-beta.24) 下载，然后设置环境变量 `CAMOUFOX_EXECUTABLE_PATH` 为可执行文件的路径（支持绝对和相对路径）。

3. 配置环境变量（可选）：

   复制根目录下的 `.env.example` 为 `.env`，并在 `.env` 中按需修改配置（如端口、API 密钥等）。

4. 启动服务：

   ```bash
   npm start
   ```

   API 服务将在 `http://localhost:7860` 上运行。

   服务启动后，您可以在浏览器中访问 `http://localhost:7860` 打开 Web 控制台主页，在这里可以查看账号状态和服务状态。
   请求统计数据会持久化保存到 `/data/usage-stats.jsonl`。

5. 更新到最新版本（已有本地部署时）：

   ```bash
   git pull
   npm install
   ```

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
  -v /path/to/data:/app/data \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  ghcr.io/ibuhub/aistudio-to-api:latest
```

> 💡 **提示：** 如果 `ghcr.io` 访问速度较慢或不可用，可以使用 Docker Hub 镜像：`ibuhub/aistudio-to-api:latest`。

参数说明：

- `-p 7860:7860`：API 服务器端口（如果使用反向代理，强烈建议改成 `127.0.0.1:7860`）
- `-v /path/to/auth:/app/configs/auth`：挂载包含认证文件的目录
- `-v /path/to/data:/app/data`：挂载统计数据持久化目录（`/app/data/usage-stats.jsonl`）
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
      # API 服务器端口（如果使用反向代理，强烈建议改成 127.0.0.1:7860）
      - 7860:7860
    restart: unless-stopped
    volumes:
      # 挂载包含认证文件的目录
      - ./auth:/app/configs/auth
      # 挂载统计数据持久化目录
      - ./data:/app/data
    environment:
      # 用于身份验证的 API 密钥列表（使用逗号分隔）
      API_KEYS: your-api-key-1,your-api-key-2
      # 时区设置（可选，默认使用系统时区）
      TZ: Asia/Shanghai
```

> 💡 **提示：** 如果 `ghcr.io` 访问速度较慢或不可用，可以将 `image` 改为 `ibuhub/aistudio-to-api:latest`。

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
     -v /path/to/data:/app/data \
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

- 在本地机器上运行 `npm run setup-auth` 生成认证文件（参考 [直接运行](#-直接运行windows--macos--linux) 的 1 和 2），认证文件在 `/configs/auth`
- 在网页控制台，点击「上传 Auth」，上传 auth 的 JSON 文件，或手动上传到挂载的 `/path/to/auth` 目录

> 💡 **提示**：您也可以从已有的容器下载 auth 文件，然后上传到新的容器。在网页控制台点击对应账号的「下载 Auth」按钮即可下载 auth 文件。

> ⚠ 目前暂不支持通过环境变量注入认证信息。

#### 🌐 步骤 3（可选）：使用 Nginx 反向代理

如果需要通过域名访问或希望在反向代理层统一管理（例如配置 HTTPS、负载均衡等），可以使用 Nginx。

> 📖 详细的 Nginx 配置说明请参阅：[Nginx 反向代理配置文档](docs/zh/nginx-setup.md)

### 🐾 Claw Cloud Run 部署

> ℹ **Claw Cloud Run 公告：** Claw Cloud Run 已宣布停止产品及相关服务；所有服务将于 **2026/05/11 00:00 UTC** 停止，建议在此之前导出或备份数据。详情请参阅官方公告：
> [公告](https://question.run.claw.cloud/questions/10010000000003261)

支持直接部署到 Claw Cloud Run，全托管的容器平台。

> 📖 详细部署说明请参阅：[部署到 Claw Cloud Run](docs/zh/claw-cloud-run.md)

### 🦓 Zeabur 部署

> ℹ **Zeabur 公告：** 自 **2026/03/15** 起，Zeabur 已停止在 **共享集群** 上创建新项目；**已经运行在共享集群上的服务不会受到影响**。详情请参阅官方变更说明：
> [公告](https://zeabur.com/zh-CN/changelogs/phasing-out-shared-cluster)

> 📖 旧版部署教程请参阅：[部署到 Zeabur](docs/zh/zeabur.md)

## 📡 使用 API

### 🤖 OpenAI 兼容 API

此端点处理后转发到官方 Gemini API 格式端点。

- `GET /v1/models`: 列出模型。
- `POST /v1/chat/completions`: 聊天补全和图片生成，支持非流式、真流式和假流式。
- `POST /v1/responses`: OpenAI Responses API 兼容接口，用于对话生成，不支持图像生成，支持非流式、真流式和假流式。
- `POST /v1/responses/input_tokens`: 计算 OpenAI Responses API 请求的输入 token 数量。

### ♊ Gemini 原生 API 格式

此端点转发到官方 Gemini API 格式端点。

- `GET /v1beta/models`: 列出可用的 Gemini 模型。
- `POST /v1beta/models/{model_name}:generateContent`: 生成内容、图片和语音。
- `POST /v1beta/models/{model_name}:streamGenerateContent`: 流式生成内容、图片和语音，支持真流式和假流式。
- `POST /v1beta/models/{model_name}:batchEmbedContents`: 批量生成文本嵌入向量。
- `POST /v1beta/models/{model_name}:predict`: Imagen 系列模型图像生成。

### 👤 Anthropic 兼容 API

此端点处理后转发到官方 Gemini API 格式端点。

- `GET /v1/models`: 列出模型。
- `POST /v1/messages`: 聊天消息补全，支持非流式、真流式和假流式。
- `POST /v1/messages/count_tokens`: 计算消息中的 token 数量。

> 📖 详细的 API 使用示例请参阅：[API 使用示例文档](docs/zh/api-examples.md)

## 🖥️ 推荐前端：AMC WebUI

[AMC WebUI](https://github.com/yeahhe365/AMC-WebUI) 是一款面向 Gemini 的 Local-First AI 工作流 WebUI，集成多模态聊天、Canvas、文件处理、实时搜索、代码执行与高级推理。它已经支持将 AIStudioToAPI 作为第三方 Gemini 兼容后端使用，可以作为本项目的图形化前端。

在线 Demo：[https://all-model-chat.pages.dev](https://all-model-chat.pages.dev)

使用方式：

- 先部署并启动 AIStudioToAPI，确保 Gemini 原生 API 地址可访问，例如 `http://localhost:7860/v1beta`。
- 在 AMC WebUI 中进入 **设置 -> API 配置**，启用“自定义 API 配置”，并将 Gemini 兼容 Base URL 填为 AIStudioToAPI 的 `/v1beta` 地址。
- AMC WebUI 中填写的 API Key 应与 AIStudioToAPI 部署时配置的 `API_KEYS` 对应。

## 🧰 相关配置

### 🔧 环境变量

#### 📱 应用配置

| 变量名                      | 描述                                                                                                                           | 默认值               |
| :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------- | :------------------- |
| `API_KEYS`                  | 用于身份验证的有效 API 密钥列表（使用逗号分隔）。                                                                              | `123456`             |
| `WEB_CONSOLE_USERNAME`      | 网页控制台登录的用户名（可选）。如果同时设置用户名和密码，登录时需要输入两者。                                                 | 无                   |
| `WEB_CONSOLE_PASSWORD`      | 网页控制台登录的密码（可选）。如果只设置密码，登录页面仅要求输入密码；如果两者都不设置，系统将使用 `API_KEYS` 进行控制台登录。 | 无                   |
| `PORT`                      | API 服务器端口。                                                                                                               | `7860`               |
| `HOST`                      | 服务器监听的主机地址。                                                                                                         | `0.0.0.0`            |
| `ICON_URL`                  | 用于自定义控制台的 favicon 图标。支持 ICO, PNG, SVG 等格式。                                                                   | `/AIStudio_logo.svg` |
| `SECURE_COOKIES`            | 是否启用安全 Cookie。`true` 表示仅支持 HTTPS 协议访问控制台。                                                                  | `false`              |
| `RATE_LIMIT_MAX_ATTEMPTS`   | 时间窗口内控制台允许的最大失败登录尝试次数（设为 `0` 禁用）。                                                                  | `5`                  |
| `RATE_LIMIT_WINDOW_MINUTES` | 速率限制的时间窗口长度（分钟）。                                                                                               | `15`                 |
| `CHECK_UPDATE`              | 是否在页面加载时检查版本更新（设为 `false` 禁用）。                                                                            | `true`               |
| `LOG_LEVEL`                 | 日志输出等级。设为 `DEBUG` 启用详细调试日志。                                                                                  | `INFO`               |
| `TZ`                        | 日志和显示时间使用的时区，例如 `Asia/Shanghai`。留空时默认使用系统时区。                                                       | 系统时区             |

#### 🌐 代理配置

| 变量名                          | 描述                                                                                                                                                                | 默认值    |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------- |
| `INITIAL_AUTH_INDEX`            | 启动时使用的初始身份验证索引。                                                                                                                                      | `0`       |
| `ENABLE_AUTH_UPDATE`            | 是否启用自动保存凭证更新。默认为启用状态，将在每次登录/切换账号成功时以及每 24 小时自动更新 auth 文件。设为 `false` 禁用。                                          | `true`    |
| `MAX_RETRIES`                   | 请求失败后的最大重试次数（仅对假流式和非流式生效）。                                                                                                                | `3`       |
| `RETRY_DELAY`                   | 两次重试之间的间隔（毫秒）。                                                                                                                                        | `2000`    |
| `SWITCH_ON_USES`                | 自动切换帐户前允许的请求次数（设为 `0` 禁用）。                                                                                                                     | `40`      |
| `FAILURE_THRESHOLD`             | 切换帐户前允许的连续失败次数（设为 `0` 禁用）。                                                                                                                     | `3`       |
| `IMMEDIATE_SWITCH_STATUS_CODES` | 触发立即切换帐户的 HTTP 状态码（逗号分隔，设为空值以禁用）。                                                                                                        | `429,503` |
| `MAX_CONTEXTS`                  | 最大同时登录的账号数量。同时登录的账号切换更快，无需重新登录。数值越大内存消耗越高（约：1 个账号 ~700MB，2 个账号 ~950MB，3 个账号 ~1100MB）。设为 `0` 表示无限制。 | `1`       |
| `HTTP_PROXY`                    | 用于访问 Google 服务的 HTTP 代理地址。                                                                                                                              | 无        |
| `HTTPS_PROXY`                   | 用于访问 Google 服务的 HTTPS 代理地址。                                                                                                                             | 无        |
| `NO_PROXY`                      | 不经过代理的地址列表（逗号分隔）。项目已内置自动绕过本地地址（localhost, 127.0.0.1, 0.0.0.0），通常无需手动配置本地绕过。                                           | 无        |

#### 🗒️ 其他配置

| 变量名                      | 描述                                                                                                        | 默认值   |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------- | :------- |
| `STREAMING_MODE`            | 流式传输模式。`real` 为真流式，`fake` 为假流式。                                                            | `real`   |
| `ENABLE_USAGE_STATS`        | 是否启用请求统计。默认为启用；设为 `false` 后，不读取本地统计、不写入统计，`/api/usage-stats` 返回空数据。  | `true`   |
| `SAFETY_SETTINGS_THRESHOLD` | 安全设置的等级。官方说明：[Safety settings](https://ai.google.dev/gemini-api/docs/safety-settings?hl=zh-cn) | `OFF`    |
| `FORCE_THINKING`            | 强制为所有请求启用思考模式。                                                                                | `false`  |
| `FORCE_WEB_SEARCH`          | 强制为所有请求启用网络搜索。                                                                                | `false`  |
| `FORCE_URL_CONTEXT`         | 强制为所有请求启用 URL 上下文。                                                                             | `false`  |
| `CAMOUFOX_EXECUTABLE_PATH`  | Camoufox 浏览器的可执行文件路径（支持绝对或相对路径）。仅在手动下载浏览器时需配置。                         | 自动检测 |

### ⚡ 账号自动填充

为了简化多个账号的登录流程，您可以通过配置 `users.csv` 文件来实现自动填充：

1. 在项目根目录创建 `users.csv`。
2. 格式为：`email,password,recovery_email,totp_secret`（每行一个，`recovery_email` 和 `totp_secret` 可选）。
3. 运行 `npm run setup-auth` 后按提示选择账号。

> 📖 详细配置说明请参阅：[账号自动填充指南](docs/zh/auto-fill-guide.md)
>
> 💡 **提示**：如果需要无交互执行，可使用 `npm run setup-auth -- --non-interactive --account 1`，或直接传入 `--email` / `--password`。
>
> 💡 **批量添加**：使用 `npm run setup-auth-batch -- --headless` 可按顺序添加 `users.csv` 中的全部账号。

### 🧠 模型列表配置

编辑 `configs/models.json` 以自定义可用模型及其设置。

> 💡 **提示：** 思考参数预留了通过模型后缀名来设置的功能，支持在模型名后面通过 `-THINKING_LEVEL` 或 `(THINKING_LEVEL)` 来设置（`THINKING_LEVEL` 支持 `high`、`low`、`medium`、`minimal`，不区分大小写）。例如：`gemini-3-flash-preview(minimal)` 或 `gemini-3-flash-preview-minimal`。
>
> 真假流式也支持通过模型名后缀覆盖，支持追加 `-real` 或 `-fake`。该后缀优先级高于系统的真假流式，但只会在流式请求中生效。例如：`gemini-3-flash-preview-fake`。若和思考后缀同时使用，真假流后缀应放在思考后缀之后，例如：`gemini-3-flash-preview-minimal-fake` 或 `gemini-3-flash-preview(minimal)-real`。
>
> 联网搜索也支持通过模型名后缀强制开启，支持在模型名最后追加 `-search`。例如：`gemini-3-flash-preview-search`。若和其他后缀同时使用，`-search` 必须放在最末尾；完整组合顺序仍为“思考 -> 流式 -> 搜索”，例如：`gemini-3-flash-preview-minimal-search`、`gemini-3-flash-preview-real-search` 或 `gemini-3-flash-preview(minimal)-fake-search`。

## 📄 许可证

本项目基于 [**ais2api**](https://github.com/Ellinav/ais2api)（作者：[**Ellinav**](https://github.com/Ellinav)）分支开发，并完全沿用上游项目所采用的 CC BY-NC 4.0 许可证，其使用、分发与修改行为均需遵守原有许可证的全部条款，完整许可的内容请参见 [LICENSE](LICENSE) 文件。

## 🤝 贡献者

[![Contributors](https://contrib.rocks/image?repo=iBUHub/AIStudioToAPI)](https://github.com/iBUHub/AIStudioToAPI/graphs/contributors)

感谢所有为本项目付出汗水与智慧的开发者。

---

如果你觉得 AIStudioToAPI 对你有帮助，欢迎给项目点一个 ⭐️！

[![Star History Chart](https://api.star-history.com/svg?repos=iBUHub/AIStudioToAPI&type=date&legend=top-left)](https://www.star-history.com/#iBUHub/AIStudioToAPI&type=date&legend=top-left)
