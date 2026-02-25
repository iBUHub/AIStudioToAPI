# Deploy on Claw Cloud Run

This guide will help you deploy the `aistudio-to-api` service on [Claw Cloud Run](https://claw.cloud/).

## 📦 Deployment Steps

1. **Login**: Go to [https://us-west-1.run.claw.cloud](https://us-west-1.run.claw.cloud) and log in to your account.
2. **Create App**: Navigate to **App Launchpad** and click the **Create App** button in the top right corner.
3. **Configure Application**: Fill in the following parameters:
   - **Application Name**: Enter any name you prefer (e.g., `aistudio-api`).
   - **Image**: Select **Public**.
   - **Image Name**: `ghcr.io/ibuhub/aistudio-to-api:latest`

   **Usage**:
   - **CPU**: `0.5`
   - **Memory**: `1G`

   > 💡 **Tip**: If you need to log in via VNC, **1G Memory** might not be sufficient for the browser. It is recommended to temporarily adjust the configuration to **0.2 CPU / 2G Memory** for the VNC login process, and then revert to **0.5 CPU / 1G Memory** after logging in.

   **Network**:
   - **Container Port**: `7860`
   - **Public Access**: Toggle **On** (Leave the URL usage as is).

   **Local Storage**:
   - **Capacity**：1
   - **Mount Path**：/app/configs/auth

   **Environment Variables**:

   You must set the `API_KEYS` variable. Other variables are optional (refer to the [Configuration](../../README_EN.md#-configuration) section in the main README).

   | Name       | Value                 | Description                                |
   | :--------- | :-------------------- | :----------------------------------------- |
   | `API_KEYS` | `your-secret-key-123` | **Required**. Define your own access keys. |

   > ⚠️ **Warning**: Do not set or modify the `MAX_CONTEXTS` environment variable. Keep the default value of 1. Increasing this value will significantly increase memory usage and may cause the service to crash due to insufficient memory.

4. **Deploy**: Click **Create App** to start the deployment.

## 📡 Accessing the Service

1. Once the app is running, go to the **Network** tab in the App details page.
2. Copy the **Public Address** (URL).
3. Access the URL in your browser. You will need to enter the `API_KEYS` you configured to access the management console.

## 🔑 Account Management

After deployment, you need to add Google accounts. There are two methods:

**Method 1: VNC-Based Login (Recommended)**

- Access the deployed service address in your browser and click the "Add User" button
- You'll be redirected to a VNC page with a browser instance
- Log in to your Google account, then click the "Save" button after login is complete

**Method 2: Upload Auth Files**

- Run `npm run setup-auth` on your local machine to generate auth files (refer to steps 1 and 2 of [Run Directly](../../README_EN.md#-run-directly-windows--macos--linux) in the main README), the auth files are in `/configs/auth`
- In the web console, click "Upload Auth" to upload the auth JSON file

> 💡 **Tip**: You can also download auth files from an existing server and upload them to a new server. Click the "Download Auth" button for the corresponding account in the web console to download the auth file.

## 🔌 API Endpoints

After deployment, you can access the API using the **Public Address** combined with the following Base URLs:

- **OpenAI Compatible Base URL**: `https://<your-public-address>/v1`
- **Gemini Compatible Base URL**: `https://<your-public-address>/v1beta`
- **Anthropic Compatible Base URL**: `https://<your-public-address>/v1`

> For more details, please refer to the [API Usage](../../README_EN.md#-api-usage) section in the main README.

## 🔄 Updating the Application

To update to the latest version, click the **Update** button in the top right corner of the App details page.
