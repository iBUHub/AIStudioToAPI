# Auto-fill Account Guide

Using a `users.csv` file significantly simplifies the Google login process.

### 1. Prepare Account File

Create a `users.csv` file in the project root and add your account credentials in the following format:

```csv
email,password
your-email-1@gmail.com,your-password-1
your-email-2@gmail.com,your-password-2
```

> 💡 **Tip**: The header in the first line (`email,password`) is optional. The script automatically identifies the column containing the `@` symbol as the account.

### 2. Start Login

Run the setup script:

```bash
npm run setup-auth
```

When prompted in the terminal, select the account you want to use. The script will automatically open the browser and fill in the selected account's credentials.

### 3. Considerations

- **Security**: The `users.csv` file contains plain-text passwords; ensure your computer is secure and do not share this file.
- **2FA**: If your account has Two-Factor Authentication (2FA) enabled, you will still need to complete the verification manually in the browser.
