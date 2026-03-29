#!/bin/bash

# ==============================================================================
# Fail2Ban Setup Script for StartupHub
# Run this script on your Linux/Ubuntu VPS to enable automatic IP blocking.
# ==============================================================================

if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root (sudo ./fail2ban-setup.sh)"
  exit 1
fi

echo "🛡️ Installing Fail2Ban..."
apt-get update
apt-get install -y fail2ban

# Create the local jail configuration
# We use .local so it doesn't get overwritten during package updates
echo "🛡️ Configuring Nginx Rate-Limit Protections..."

cat << 'EOF' > /etc/fail2ban/jail.local
[DEFAULT]
# IPs to never ban (add your own static IP here if you have one, e.g., 12.34.56.78)
ignoreip = 127.0.0.1/8 ::1

# Ban time: 86400 seconds (24 hours)
bantime  = 86400

# The time window fail2ban looks at
findtime = 60

# Max retries before banning
maxretry = 5

# --- StartupHub Nginx Protections ---
[nginx-limit-req]
enabled = true
port    = http,https
filter  = nginx-limit-req
logpath = /var/log/nginx/error.log
findtime = 60
bantime = 86400
maxretry = 5

[nginx-botsearch]
enabled = true
port    = http,https
filter  = nginx-botsearch
logpath = /var/log/nginx/access.log
          /var/log/nginx/error.log
findtime = 60
bantime = 86400
maxretry = 2
EOF

echo "🛡️ Restarting and Enabling Fail2Ban..."
systemctl restart fail2ban
systemctl enable fail2ban

echo "✅ Fail2Ban successfully installed and activated!"
echo ""
echo "Commands to check status in the future:"
echo "- To see banned IPs: sudo fail2ban-client status nginx-limit-req"
echo "- To unban an IP: sudo fail2ban-client set nginx-limit-req unbanip <IP_ADDRESS>"

exit 0
