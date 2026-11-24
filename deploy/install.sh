#!/bin/sh
# Install / update NUC Control on server1. Run from the unpacked source dir as nuc: sh deploy/install.sh
# First run also creates the nuc-panel user, its ssh key for the Distiller, and prints the next steps.
set -eu
SRC=$(cd "$(dirname "$0")/.." && pwd)
DATA=/var/lib/nuc-panel

id nuc-panel >/dev/null 2>&1 || sudo useradd --system --home-dir $DATA --shell /usr/sbin/nologin nuc-panel
sudo install -d -o nuc-panel -g nuc-panel -m 700 $DATA $DATA/.ssh
sudo install -o root -g root -m 755 "$SRC/ctl/nuc-ctl" /usr/local/sbin/nuc-ctl

echo 'nuc-panel ALL=(root) NOPASSWD: /usr/local/sbin/nuc-ctl' | sudo tee /etc/sudoers.d/nuc-panel.tmp >/dev/null
sudo chmod 440 /etc/sudoers.d/nuc-panel.tmp
sudo visudo -cf /etc/sudoers.d/nuc-panel.tmp >/dev/null && sudo mv /etc/sudoers.d/nuc-panel.tmp /etc/sudoers.d/nuc-panel

sudo install -d -o root -g root -m 755 /opt/nuc-control /opt/nuc-control/server /opt/nuc-control/public
sudo cp -r "$SRC/server/." /opt/nuc-control/server/
sudo cp -r "$SRC/public/." /opt/nuc-control/public/
sudo chown -R root:root /opt/nuc-control

# ssh key the panel uses for the Distiller (forced command there, see distiller-setup.sh)
sudo test -f $DATA/.ssh/id_ed25519 || sudo -u nuc-panel ssh-keygen -q -t ed25519 -N '' -C nuc-panel@server1 -f $DATA/.ssh/id_ed25519
ssh-keygen -F distiller -f "$HOME/.ssh/known_hosts" | grep -v '^#' | sudo tee $DATA/.ssh/known_hosts >/dev/null || true
sudo chown nuc-panel:nuc-panel $DATA/.ssh/known_hosts

sudo install -m 644 "$SRC/deploy/nuc-control.service" /etc/systemd/system/nuc-control.service
sudo install -m 644 "$SRC/deploy/nuc-cpu-apply.service" /etc/systemd/system/nuc-cpu-apply.service
sudo systemctl daemon-reload
sudo systemctl enable nuc-cpu-apply.service >/dev/null 2>&1
if sudo test -f $DATA/auth.json; then
	sudo systemctl enable nuc-control.service >/dev/null 2>&1
	sudo systemctl restart nuc-control.service
	echo "NUC Control updated and restarted"
else
	echo "set a password: echo 'PASSWORD' | sudo -u nuc-panel /usr/local/bin/node /opt/nuc-control/server/main.mjs --set-password"
	echo "then: sudo systemctl enable --now nuc-control"
fi
echo "panel ssh key: $(sudo cat $DATA/.ssh/id_ed25519.pub)"
