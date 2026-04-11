# Nginx Reverse Proxy Configuration

If you need to access via a domain name or want unified management at the reverse proxy layer (e.g., configure HTTPS, load balancing, etc.), you can use Nginx.

## 🚀 Quick Start

Create an Nginx configuration file `/etc/nginx/sites-available/aistudio-api`:

```nginx
server {
    listen 80;
    listen [::]:80;  # IPv6 support
    server_name your-domain.com;  # Replace with your domain

    # For HTTPS, uncomment the following lines and configure SSL certificates
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;  # IPv6 HTTPS
    # ssl_certificate /path/to/your/certificate.crt;
    # ssl_certificate_key /path/to/your/private.key;

    # Client request body size limit (0 = unlimited)
    client_max_body_size 0;

    location / {
        # Reverse proxy to Docker container
        proxy_pass http://127.0.0.1:7860;

        # Critical: Pass real client IP
        # X-Real-IP: Highest priority, contains the real client IP
        proxy_set_header X-Real-IP $remote_addr;

        # X-Forwarded-For: Contains the complete proxy chain
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Other necessary proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout settings (adapted for long-running AI requests)
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        # Disable buffering to support streaming responses
        proxy_buffering off;

	    # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

### 🟢 Enable Configuration

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/aistudio-api /etc/nginx/sites-enabled/

# Test if configuration is correct
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## 🚨 Important Notes

### 🌐 Multi-layer Proxy Configuration

**⚠ Important**: If using multiple Nginx proxies (e.g., Client -> Public Gateway -> Internal Gateway -> App), only use `proxy_set_header X-Real-IP $remote_addr` at the **outermost public-facing gateway**, inner proxies should use `$http_x_real_ip` to pass through, which **should NOT override** `X-Real-IP`:

```nginx
# Inner Nginx (internal gateway) configuration example
location / {
    proxy_pass http://127.0.0.1:7860;

    # Critical: Pass through upstream X-Real-IP, do NOT override with $remote_addr
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # Other necessary proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeout settings
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;

    # Disable buffering
    proxy_buffering off;

	# WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
```

## 🍪 Secure Cookie Settings

- If you configured HTTPS, it's recommended to set environment variable `SECURE_COOKIES=true` to enable secure cookies
- If using HTTP only, keep `SECURE_COOKIES=false` (default) or leave it unset
