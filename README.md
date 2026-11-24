# NUC Control

Phone-first control panel for server1 + the Distiller.

- Public: https://server1.tail3cde65.ts.net/ (Tailscale Funnel :443 → 127.0.0.1:8810 on server1). Login file: Desktop\NUC Control login.txt
- server1: `nuc-control.service` (user nuc-panel, data /var/lib/nuc-panel), app in /opt/nuc-control
- Privileged work: `/usr/local/sbin/nuc-ctl` (whitelisted actions, JSON out) — sudo on server1; on the Distiller a forced-command ssh key (`nuc-panel@server1` in ~distiller/.ssh/authorized_keys) that can only run nuc-ctl
- Deploy from the PC: `sh deploy/push.sh`
- Reset the password on server1: `echo 'NEW' | sudo -u nuc-panel /usr/local/bin/node /opt/nuc-control/server/main.mjs --set-password && sudo systemctl restart nuc-control`
- Turn public access off: `sudo tailscale funnel --https=443 off`
- Model logos: Simple Icons (CC0), public/logos.json
