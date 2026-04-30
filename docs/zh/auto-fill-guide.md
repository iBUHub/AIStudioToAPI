# 账号自动填充使用指南

通过配置 `users.csv` 文件，可以大幅简化 Google 账号的登录流程。

### 1. 准备账号文件

在项目根目录创建 `users.csv`，按以下格式添加账号密码：

```csv
email,password
your-email-1@gmail.com,your-password-1
your-email-2@gmail.com,your-password-2
```

> 💡 **提示**：第一行的表头（`email,password`）是可选的，脚本会自动识别包含 `@` 符号的列作为账号。

### 2. 开始登录

运行设置脚本：

```bash
npm run setup-auth
```

在控制台中，根据提示选择要使用的账号即可。脚本将自动打开浏览器并填入所选账号的凭据。

如果需要无交互执行，可以直接指定账号：

```bash
npm run setup-auth -- --non-interactive --account 1
```

或者直接传入账号密码：

```bash
npm run setup-auth -- --non-interactive --email your-email@gmail.com --password your-password --headless
```

如果账号启用了基于 TOTP 的 2FA，可以追加 `--totp-secret`：

```bash
npm run setup-auth -- --non-interactive --email your-email@gmail.com --password your-password --totp-secret your-base32-secret --headless
```

无交互模式下，如果在超时时间内未检测到 AI Studio 登录成功，脚本会直接退出并返回非 0 状态码。可通过 `--login-timeout-ms` 调整超时时间。

### 3. 注意事项

- **安全**：`users.csv` 包含明文密码，请确保您的计算机安全且不要分享该文件。
- **首次协议**：新账号首次进入 AI Studio 时，如果出现协议弹窗，脚本会尝试自动勾选复选框并点击 `I agree` / `同意` / `继续` 等按钮。
- **2FA**：如果账号启用了双重身份验证（2FA），标准 TOTP 可以通过 `--totp-secret` 自动填写；其他方式仍需在浏览器中手动完成。
- **TOTP 限制**：`--totp-secret` 只适用于标准 TOTP（例如 Google Authenticator / Aegis），不适用于短信验证码、Google Prompt、Passkey 或图形验证码。
