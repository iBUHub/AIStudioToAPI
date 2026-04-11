# Deploy on Zeabur

This guide will help you deploy the `aistudio-to-api` service on [Zeabur](https://zeabur.com/).

> [!IMPORTANT]
> **Notice: Since March 15, 2026, Zeabur no longer allows new projects to be created on the Shared Cluster, so this free setup path is no longer available for new deployments. The instructions below are kept as a legacy reference.**
>
> Official changelog: https://zeabur.com/changelogs/phasing-out-shared-cluster

> [!CAUTION]
> **The free-tier note below is part of the legacy tutorial context: Zeabur's free tier provides only $5 credits per month, which is not enough to run the service 24/7. Please make sure to pause the service when not in use!**

## 📦 Deployment Steps

1. **Login**: Go to [https://zeabur.com/projects](https://zeabur.com/projects) and log in to your account.
2. **New Project**: Click the **New Project** button, select **Shared Cluster**, then select **Jakarta, Indonesia** as the region.
3. **Deploy Service**: Click **Deploy New Service**, select **Add Service**, then choose **Docker Image**.
4. **Configure Application**: Fill in the following parameters:

   **Image**:
   - **Image Name**: `ghcr.io/ibuhub/aistudio-to-api:latest`
   - **Username**: Leave empty
   - **Password**: Leave empty

   **Environment Variables**:
   - Click the **Add Environment Variable** button.
   - **Do NOT click "Expose"**.
   - You must set the `API_KEYS` variable. Other variables are optional (refer to the [Configuration](../../README_EN.md#-configuration) section in the main README).

   | Name       | Value                 | Description                                |
   | :--------- | :-------------------- | :----------------------------------------- |
   | `API_KEYS` | `your-secret-key-123` | **Required**. Define your own access keys. |

   > ⚠️ **Warning**: Do not set or modify the `MAX_CONTEXTS` environment variable. Keep the default value of 1. Increasing this value will significantly increase memory usage and may cause the service to crash due to insufficient memory.

   **Port**:
   - Click the **Add Port** button.
   - **Port Number**: `7860`
   - **Port Type**: `HTTP`

   **Volumes**:
   - Click the **Add Volume** button.
   - **Volume ID**: `auth`
   - **Path**: `/app/configs/auth`

5. **Deploy**: Click the **Deploy** button to start the deployment.
6. **Configure Public Access**:
   - Click the **Network** tab.
   - Click **Public Access**.
   - Click the **+ Generate Domain** button to create a custom domain.

## 📡 Accessing the Service

Once the application is running, access the service via the generated public domain. Enter the `API_KEYS` you configured to access the management console.

## 🔑 Account Management

After deployment, you need to add Google accounts by uploading auth files:

**Upload Auth Files**

- Run `npm run extract-auth` on your local machine to extract auth files (refer to steps 1 through 3 of [Run Directly](../../README_EN.md#-run-directly-windows--macos--linux) in the main README), the auth files are in `configs/auth`
- In the web console, click "Upload Auth" to upload the auth JSON file

> 💡 **Tip**: You can also download auth files from an existing server and upload them to a new server. Click the "Download Auth" button for the corresponding account in the web console to download the auth file.

## 🔌 API Endpoints

After deployment, you can access the API using the public domain combined with the following Base URLs:

- **OpenAI Compatible Base URL**: `https://<your-public-domain>/v1`
- **OpenAI Responses Compatible Base URL**: `https://<your-public-domain>/v1`
- **Gemini Compatible Base URL**: `https://<your-public-domain>/v1beta`
- **Anthropic Compatible Base URL**: `https://<your-public-domain>/v1`

> For more details, please refer to the [API Usage](../../README_EN.md#-api-usage) section in the main README.

## ⏸️ Pausing and Starting the Service

> [!WARNING]
> Zeabur's $5 credits are not enough to run 24/7. **It is strongly recommended to pause the service when not in use** to save credits! Start it again when needed.

### Pausing the Service

1. Go to the service details page.
2. Click the **Settings** tab.
3. Scroll to the bottom and click the **Pause Service** button.

### Starting the Service

1. Go to the service status page.
2. Click the **Restart Current Version** button.

## 🔄 Version Update

To update to the latest version:

1. Go to the service details page.
2. Click the **Service** tab.
3. Click the **Restart Current Version** button.
