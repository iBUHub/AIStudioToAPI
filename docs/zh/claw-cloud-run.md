# 部署到 Claw Cloud Run

本指南将帮助你在 [Claw Cloud Run](https://claw.cloud/) 上部署 `aistudio-to-api` 服务。

## 📦 部署步骤

1. **登录**：前往 [https://us-west-1.run.claw.cloud](https://us-west-1.run.claw.cloud) 并登录你的账号。
2. **创建应用**：进入 **App Launchpad**，点击右上角的 **Create App** 按钮。
3. **配置应用**：填写以下参数：
   - **Application Name**：填写一个你喜欢的英文名称（例如 `aistudio-api`）。
   - **Image**：选择 **Public**。
   - **Image Name**：`ghcr.io/ibuhub/aistudio-to-api:latest`

   **Usage**:
   - **CPU**：`0.5`
   - **Memory**：`1G`

   > 💡 **提示**：如果需要通过 VNC 登录账号，**1G 内存**可能不足以支撑浏览器运行。建议先将配置调整为 **0.2 CPU / 2G Memory** 进行 VNC 登录操作，登录完成后再改回 **0.5 CPU / 1G Memory**。

   **Network**:
   - **Container Port**：`7860`
   - **Public Access**：开启（Toggle **On**，后面的网址选项不用动）。

   **Local Storage**:
   - **Capacity**：1
   - **Mount Path**：/app/configs/auth

   **环境变量（Environment Variables）**:

   必填参数 `API_KEYS`。其他参数选填（参考主 README 中的 [配置](../../README.md#-相关配置) 部分）。

   | Name       | Value                 | Description                                        |
   | :--------- | :-------------------- | :------------------------------------------------- |
   | `API_KEYS` | `your-secret-key-123` | **必填**。自定义你的访问密钥，多个密钥用逗号分隔。 |

   > ⚠️ **注意**：请勿设置或修改 `MAX_CONTEXTS` 环境变量，保持默认值 1 即可。增加该值会显著提高内存占用，可能导致服务因内存不足而崩溃。

4. **部署**：点击 **Create App** 开始部署。

## 📡 访问服务

1. 等待应用运行起来后，在应用详情页点击 **Network** 标签页。
2. 复制 **Public Address**（公网地址）。
3. 在浏览器中访问该地址。输入你设置的 `API_KEYS` 即可进入管理页面。

## 🔑 账号管理

部署后，需要添加 Google 账号。有以下两种方式：

**方法 1：VNC 登录（推荐）**

- 在浏览器中访问部署的服务地址并点击「添加账号」按钮
- 将跳转到 VNC 页面，显示浏览器实例
- 登录您的 Google 账号，登录完成后点击「保存」按钮

**方法 2：上传认证文件**

- 在本地机器上运行 `npm run setup-auth` 生成认证文件（参考主 README 中的 [直接运行](../../README.md#-直接运行windows--macos--linux) 的 1 和 2），认证文件在 `/configs/auth`
- 在网页控制台，点击「上传 Auth」，上传 auth 的 JSON 文件

> 💡 **提示**：您也可以从已有的服务器下载 auth 文件，然后上传到新的服务器。在网页控制台点击对应账号的「下载 Auth」按钮即可下载 auth 文件。

## 🔌 API 访问地址

部署完成后，使用 **Public Address** 配合以下 Base URL 访问 API：

- **OpenAI 兼容 Base URL**: `https://<your-public-address>/v1`
- **Gemini 兼容 Base URL**: `https://<your-public-address>/v1beta`
- **Anthropic 兼容 Base URL**: `https://<your-public-address>/v1`

> 更多详细信息，请参考主 README 中的 [使用 API](../../README.md#-使用-api) 章节。

## 🔄 版本更新

如需更新到最新版本，在应用详情页面点击右上角的 **Update** 按钮即可。
