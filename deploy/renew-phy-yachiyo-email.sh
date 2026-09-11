#!/bin/sh
set -eu

renewed_marker=/opt/1panel/www/sites/phy.yachiyo.email/ssl/.phy-renewed

/usr/bin/docker run --rm --name certbot-renew-phy-yachiyo \
    -v /opt/1panel/www/sites/phy.yachiyo.email/ssl:/etc/letsencrypt \
    -v /opt/1panel/www/sites/phy.yachiyo.email/index:/var/www/html \
    certbot/certbot:latest renew \
    --quiet \
    --no-random-sleep-on-renew \
    --deploy-hook "touch /etc/letsencrypt/.phy-renewed"

if [ -f "$renewed_marker" ]; then
    /usr/bin/docker exec 1Panel-openresty-ggdy openresty -t
    /usr/bin/docker exec 1Panel-openresty-ggdy openresty -s reload
    /usr/bin/rm -f "$renewed_marker"
fi
