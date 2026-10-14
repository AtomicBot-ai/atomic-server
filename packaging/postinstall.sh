#!/bin/sh
# After an upgrade, a running atc server or service still runs the old binary. dpkg passes
# `configure <old-version>` (no old version on a first install); rpm passes the number of installed
# instances (2 during an upgrade). Nothing to say on a first install.
case "${1:-}" in
  configure) [ -n "${2:-}" ] || exit 0 ;;
  [0-9]*) [ "$1" -ge 2 ] || exit 0 ;;
  *) exit 0 ;;
esac
echo 'atc: a running atc server or service keeps the previous version until "atc restart".'
exit 0
