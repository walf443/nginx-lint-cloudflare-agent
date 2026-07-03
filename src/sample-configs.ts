/**
 * A spread of representative nginx configs used for auto-verification. There is
 * no ground truth per rule (the rule is arbitrary), so this is a behavior/
 * robustness smoke test: it surfaces crashes and over-flagging, and lets a
 * human eyeball whether the plugin fires where expected. Backend-agnostic.
 */

import type { ConfigSample } from "./backends/types.js";

export const SAMPLE_CONFIGS: ConfigSample[] = [
  {
    name: "minimal",
    content: `events {}
http {
    server {
        listen 80;
        server_name example.com;
        location / {
            root /var/www/html;
        }
    }
}
`,
  },
  {
    name: "typical-web-server",
    content: `user www-data;
worker_processes auto;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain application/json;
    server {
        listen 80;
        server_name www.example.com;
        return 301 https://$host$request_uri;
    }
    server {
        listen 443 ssl;
        server_name www.example.com;
        ssl_certificate /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }
    }
}
`,
  },
  {
    name: "reverse-proxy",
    content: `events {}
http {
    upstream backend {
        server 127.0.0.1:8080;
        server 127.0.0.1:8081;
    }
    server {
        listen 80;
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
`,
  },
  {
    name: "insecure-ish",
    content: `events {}
http {
    server_tokens on;
    server {
        listen 443 ssl;
        server_name legacy.example.com;
        ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
        ssl_certificate /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        autoindex on;
        location / {
            root /var/www;
        }
    }
}
`,
  },
  {
    name: "empty",
    content: `events {}
http {}
`,
  },
];
