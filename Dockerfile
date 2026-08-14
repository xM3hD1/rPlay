FROM nginx:alpine

# Remove default site configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom hardened nginx config
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend static files
COPY ./public /usr/share/nginx/html

# Fix permissions so Nginx can run non-root
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to unprivileged user
USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]