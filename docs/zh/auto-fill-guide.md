# 账号自动填充使用指南

通过配置 `users.csv` 文件，可以大幅简化 Google 账号的登录流程。

### 1. 准备账号文件

在项目根目录创建 `users.csv`，按以下格式添加账号密码：

```csv
email,password
your-email-1@foo.xyz,your-password-1
your-email-2@foo.xyz,your-password-2
```

> 💡 **提示**：第一行的表头（`email,password`）是可选的，脚本会自动识别包含 `@` 符号的列作为账号。

### 2. 开始登录

运行设置脚本：

```bash
npm run setup-auth
```

在控制台中，根据提示选择要使用的账号即可。脚本将自动打开浏览器并填入所选账号的凭据。

### 3. 注意事项

- **安全**：`users.csv` 包含明文密码，请确保您的计算机安全且不要分享该文件。
- **2FA**：如果账号启用了双重身份验证（2FA），您仍需在浏览器中手动完成验证。
- **Git**：该文件已被加入 `.gitignore`，不会被提交。
