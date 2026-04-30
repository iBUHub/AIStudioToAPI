# Auto-fill Account Guide

Using a `users.csv` file significantly simplifies the Google login process.

### 1. Prepare Account File

Create a `users.csv` file in the project root and add your account credentials in the following format:

```csv
email,password,totp_secret
your-email-1@gmail.com,your-password-1,BASE32TOTPSECRET1
your-email-2@gmail.com,your-password-2,
```

> 💡 **Tip**: The header in the first line is optional. The script automatically identifies the column containing the `@` symbol as the account. `totp_secret` is optional and only applies to standard TOTP 2FA.

### 2. Start Login

Run the setup script:

```bash
npm run setup-auth
```

When prompted in the terminal, select the account you want to use. The script will automatically open the browser and fill in the selected account's credentials.

For promptless execution, you can select an account directly:

```bash
npm run setup-auth -- --non-interactive --account 1
```

Or pass the credentials explicitly:

```bash
npm run setup-auth -- --non-interactive --email your-email@gmail.com --password your-password --headless
```

If the account uses TOTP-based 2FA, you can append `--totp-secret`:

```bash
npm run setup-auth -- --non-interactive --email your-email@gmail.com --password your-password --totp-secret your-base32-secret --headless
```

To add every account in `users.csv` in batch:

```bash
npm run setup-auth-batch -- --headless
```

You can also process only part of the list and continue with remaining accounts after one account fails:

```bash
npm run setup-auth-batch -- --accounts 1,3-5 --headless --continue-on-error
```

In non-interactive mode, the script exits with a non-zero status if AI Studio login is not detected before timeout. Use `--login-timeout-ms` to adjust the timeout.

### 3. Considerations

- **Security**: The `users.csv` file contains plain-text passwords; ensure your computer is secure and do not share this file.
- **First-run agreement**: When a new account enters AI Studio for the first time and a terms dialog appears, the script tries to tick visible checkboxes and click buttons such as `I agree`, `Agree`, `Continue`, or their Chinese equivalents.
- **2FA**: For accounts with Two-Factor Authentication (2FA), standard TOTP can be auto-filled with `--totp-secret`; other challenge types still need to be completed manually in the browser.
- **TOTP limitation**: `--totp-secret` only applies to standard TOTP apps such as Google Authenticator or Aegis. It does not cover SMS codes, Google Prompt, passkeys, or CAPTCHAs.
