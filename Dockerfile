FROM nginx:alpine

# 1. Remove default server config
RUN rm -f /etc/nginx/conf.d/default.conf

# 2. Copy custom server config
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# 3. Create master nginx.conf with pid set to /tmp/nginx.pid and rate limiting in http block
RUN echo 'worker_processes auto;' > /etc/nginx/nginx.conf && \
    echo 'error_log /var/log/nginx/error.log warn;' >> /etc/nginx/nginx.conf && \
    echo 'pid /tmp/nginx.pid;' >> /etc/nginx/nginx.conf && \
    echo 'events { worker_connections 1024; }' >> /etc/nginx/nginx.conf && \
    echo 'http {' >> /etc/nginx/nginx.conf && \
    echo '    include /etc/nginx/mime.types;' >> /etc/nginx/nginx.conf && \
    echo '    default_type application/octet-stream;' >> /etc/nginx/nginx.conf && \
    echo '    sendfile on;' >> /etc/nginx/nginx.conf && \
    echo '    keepalive_timeout 65;' >> /etc/nginx/nginx.conf && \
    echo '    limit_req_zone $binary_remote_addr zone=rplay_limit:10m rate=10r/s;' >> /etc/nginx/nginx.conf && \
    echo '    include /etc/nginx/conf.d/*.conf;' >> /etc/nginx/nginx.conf && \
    echo '}' >> /etc/nginx/nginx.conf

# 4. Copy static web files
COPY ./public /usr/share/nginx/html
COPY ./assets /usr/share/nginx/html/assets

# 5. Prepare required directories and permissions
RUN mkdir -p /var/cache/nginx/client_temp /var/log/nginx && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /tmp/nginx.pid && \
    chown nginx:nginx /tmp/nginx.pid

USER nginx
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]