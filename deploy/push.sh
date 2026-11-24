#!/bin/sh
# From the PC: ship this repo to server1, install it, and refresh nuc-ctl on the Distiller.
set -eu
cd "$(dirname "$0")/../.."
KEY="$HOME/.ssh/nucaloric_servers"
S1="nuc@192.168.5.192"
OPT="-i $KEY -o HostKeyAlias=server1.local"
tar czf nuc-control.tgz --exclude=.git nuc-control
scp -q $OPT nuc-control.tgz $S1:/tmp/ && rm nuc-control.tgz
ssh $OPT $S1 'cd ~/code && rm -rf nuc-control && tar xzf /tmp/nuc-control.tgz && rm /tmp/nuc-control.tgz && cd nuc-control \
	&& sh deploy/install.sh </dev/null | head -1 \
	&& scp -q -F ~/.ssh/config.nuclink ctl/nuc-ctl distiller:/tmp/nuc-ctl \
	&& ssh -F ~/.ssh/config.nuclink distiller "sudo install -o root -g root -m 755 /tmp/nuc-ctl /usr/local/sbin/nuc-ctl && rm /tmp/nuc-ctl" \
	&& echo "Distiller nuc-ctl updated" && sleep 3 && systemctl is-active nuc-control'
