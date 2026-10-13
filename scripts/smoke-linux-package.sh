#!/bin/sh
# Install atc in a clean container the way README.md tells users to, then check what a packaged install
# promises: the version, `atc update` deferring to the package manager, the completions, a server that
# starts and stops, and a removal that takes /usr/bin/atc with it. The release workflow runs it on the
# draft's repository served from loopback (before publishing) and on packages.atomic.chat (after).
#
#   smoke-linux-package.sh apt|dnf <version> <file with the README's install commands>
#   smoke-linux-package.sh pacman <version> <directory with the PKGBUILD>
set -eu

manager=$1
version=$2
input=$3

fail() {
  echo "smoke: $*" >&2
  exit 1
}

# The README's commands use sudo; a container runs as root without it.
sudo_shim() {
  command -v sudo >/dev/null 2>&1 && return 0
  cat >/usr/local/bin/sudo <<'EOF'
#!/bin/sh
exec "$@"
EOF
  chmod +x /usr/local/bin/sudo
}

case $manager in
  apt)
    export DEBIAN_FRONTEND=noninteractive
    echo 'APT::Get::Assume-Yes "true";' >/etc/apt/apt.conf.d/90-smoke
    apt-get update -qq
    apt-get install -qq curl ca-certificates >/dev/null
    sudo_shim
    sh -eux "$input"
    marker=deb
    hint=apt
    ;;
  dnf)
    echo 'assumeyes=True' >>/etc/dnf/dnf.conf
    command -v curl >/dev/null 2>&1 || dnf install -q curl
    sudo_shim
    sh -eux "$input"
    marker=rpm
    hint=dnf
    ;;
  pacman)
    # pacman's download sandbox needs syscalls a container may not grant; the container is the sandbox.
    sed -i -e 's/^#DisableSandboxSyscalls/DisableSandboxSyscalls/' \
      -e 's/^#DisableSandboxFilesystem/DisableSandboxFilesystem/' /etc/pacman.conf
    pacman -Syu --noconfirm --needed base-devel sudo namcap >/dev/null
    useradd -m builder
    echo 'builder ALL=(ALL) NOPASSWD: ALL' >/etc/sudoers.d/builder
    cp -r "$input" /home/builder/pkg
    chown -R builder /home/builder/pkg
    su builder -c 'cd ~/pkg && makepkg -si --noconfirm'
    # namcap is advice, not a gate: it flags things an -bin package does on purpose.
    namcap /home/builder/pkg/PKGBUILD /home/builder/pkg/*.pkg.tar.* || true
    marker=aur
    hint=atc-bin
    ;;
  *) fail "unknown package manager $manager" ;;
esac

test "$(atc --version)" = "$version" || fail "atc --version is $(atc --version), expected $version"
test "$(cat /usr/lib/atc/install-source)" = "$marker" || fail "the install-source marker is not $marker"
if out=$(atc update 2>&1); then fail "atc update replaced a packaged atc"; fi
echo "$out" | grep -q "$hint" || fail "atc update did not name the package manager: $out"
for f in bash-completion/completions/atc zsh/site-functions/_atc fish/vendor_completions.d/atc.fish; do
  test -s "/usr/share/$f" || fail "/usr/share/$f is missing"
done

data=$(mktemp -d)
atc config set admin.port 0 --data-folder "$data"
atc start --no-admin --data-folder "$data"
atc status --json --data-folder "$data" | grep -q '"running": true' || fail "the server did not start"
atc stop --data-folder "$data"

case $manager in
  apt) apt-get remove -qq atc >/dev/null ;;
  dnf) dnf remove -q atc ;;
  pacman) pacman -R --noconfirm atc-bin >/dev/null ;;
esac
test ! -e /usr/bin/atc || fail "/usr/bin/atc is still there after removing the package"
echo "smoke: atc $version from $manager: ok"
