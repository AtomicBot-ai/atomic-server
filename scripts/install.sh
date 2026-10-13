#!/usr/bin/env sh
# Install a released `atc` (a single binary) from GitHub Releases. Adapted from atomic-agent.
#
# Usage:
#   curl -fsSL https://github.com/AtomicBot-ai/eye-cli/releases/latest/download/install.sh | sh
#
# Environment:
#   ATC_REPO=owner/repo      (default: AtomicBot-ai/eye-cli)
#   ATC_VERSION=v0.1.0       (optional: pin a tag; default: latest)
#   ATC_INSTALL_DIR=path     (default: $HOME/.local/bin)
#   ATC_NO_PATH=1            (optional: skip the rc-file PATH update)
#   ATC_DOWNLOAD_BASE=url    (optional: a mirror holding SHA256SUMS and the binaries; also the tests' seam)
#
# Which binary (scripts/targets.mjs): the CPU and OS, then musl on a Linux without glibc (Alpine), and
# the baseline x64 build on a CPU without AVX2. A shell running under Rosetta gets the arm64 build.

set -eu

REPO="${ATC_REPO:-AtomicBot-ai/eye-cli}"
VERSION="${ATC_VERSION:-}"
INSTALL_DIR="${ATC_INSTALL_DIR:-$HOME/.local/bin}"
CPUINFO="${ATC_CPUINFO:-/proc/cpuinfo}"
# Left by a deb, rpm or AUR package of atc (src/update/install-source.ts).
PACKAGE_MARKER="${ATC_PACKAGE_MARKER:-/usr/lib/atc/install-source}"

fail() {
  echo "$1" >&2
  exit 1
}

OS_NAME="$(uname -s)"
MACHINE="$(uname -m)"
case "$MACHINE" in
  arm64 | aarch64) ARCH="aarch64" ;;
  x86_64 | amd64) ARCH="x86_64" ;;
  *) fail "unsupported CPU: $MACHINE" ;;
esac
case "$OS_NAME" in
  Darwin)
    # A Terminal under Rosetta reports x86_64 on Apple silicon; the native build is the right one.
    if [ "$ARCH" = "x86_64" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
      ARCH="aarch64"
    fi
    TRIPLE="${ARCH}-apple-darwin"
    ;;
  Linux)
    if ldd --version 2>&1 | grep -qi musl || ls /lib/ld-musl-* >/dev/null 2>&1; then
      TRIPLE="${ARCH}-unknown-linux-musl"
    elif [ "$ARCH" = "x86_64" ] && [ -r "$CPUINFO" ] && ! grep -qw avx2 "$CPUINFO"; then
      TRIPLE="${ARCH}-unknown-linux-gnu-baseline"
    else
      TRIPLE="${ARCH}-unknown-linux-gnu"
    fi
    ;;
  *) fail "unsupported OS: $OS_NAME (on Windows use install.ps1)" ;;
esac

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "install curl or wget"
  fi
}

if [ -n "${ATC_DOWNLOAD_BASE:-}" ]; then
  RELEASE="$ATC_DOWNLOAD_BASE"
elif [ -n "$VERSION" ]; then
  RELEASE="https://github.com/${REPO}/releases/download/${VERSION}"
else
  RELEASE="https://github.com/${REPO}/releases/latest/download"
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/atc-install.XXXXXX")"
TMP_BIN=""
cleanup() {
  rm -rf "$WORK"
  if [ -n "$TMP_BIN" ]; then rm -f "$TMP_BIN"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "resolving the ${VERSION:-latest} release of ${REPO} for ${TRIPLE} …"
download "${RELEASE}/SHA256SUMS" "$WORK/SHA256SUMS"
# Exact names: the triple ends the name, so `…-linux-gnu` never matches `…-linux-gnu-baseline`.
ASSET="$(awk -v t="$TRIPLE" 'index($2, "atc-") == 1 && substr($2, length($2) - length(t)) == "-" t { print $2; exit }' "$WORK/SHA256SUMS")"
if [ -z "$ASSET" ]; then
  echo "no binary for ${TRIPLE} in this release; assets:" >&2
  awk '{ print "  " $2 }' "$WORK/SHA256SUMS" >&2
  exit 1
fi
EXPECTED="$(awk -v a="$ASSET" '$2 == a { print $1; exit }' "$WORK/SHA256SUMS")"

echo "downloading ${ASSET} …"
download "${RELEASE}/${ASSET}" "$WORK/${ASSET}"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$WORK/${ASSET}" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$WORK/${ASSET}" | awk '{ print $1 }')"
else
  fail "no sha256sum or shasum to verify the download with; install one and run this again"
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  fail "checksum mismatch for ${ASSET}: expected ${EXPECTED}, got ${ACTUAL}; nothing was installed"
fi
echo "checksum verified"

mkdir -p "$INSTALL_DIR"
# Never overwrite the inode a running `atc` executes from: copy beside it, then rename over it.
TMP_BIN="$INSTALL_DIR/.atc.tmp.$$"
cp -f "$WORK/${ASSET}" "$TMP_BIN"
chmod 755 "$TMP_BIN"
mv -f "$TMP_BIN" "$INSTALL_DIR/atc"
TMP_BIN=""

add_to_path() {
  case ":${PATH:-}:" in *":$1:"*)
    PATH_STATUS="present"
    return 0
    ;;
  esac
  if [ "${ATC_NO_PATH:-0}" = "1" ]; then
    PATH_STATUS="manual"
    return 0
  fi
  # shellcheck disable=SC2016 # written to the rc file literally, expanded when the shell starts
  if [ "$1" = "$HOME/.local/bin" ]; then EXPR='$HOME/.local/bin'; else EXPR="$1"; fi
  case "$(basename "${SHELL:-sh}")" in
    zsh)
      RC="$HOME/.zshrc"
      LINE="export PATH=\"${EXPR}:\$PATH\""
      ;;
    bash)
      if [ "$OS_NAME" = "Darwin" ]; then RC="$HOME/.bash_profile"; else RC="$HOME/.bashrc"; fi
      LINE="export PATH=\"${EXPR}:\$PATH\""
      ;;
    fish)
      RC="$HOME/.config/fish/config.fish"
      LINE="set -gx PATH ${EXPR} \$PATH"
      ;;
    *)
      RC="$HOME/.profile"
      LINE="export PATH=\"${EXPR}:\$PATH\""
      ;;
  esac
  MARKER="# added by atc installer"
  mkdir -p "$(dirname "$RC")"
  [ -f "$RC" ] || : >"$RC"
  if grep -qsF "$MARKER" "$RC"; then
    PATH_STATUS="present"
    return 0
  fi
  printf '\n%s\n%s\n' "$MARKER" "$LINE" >>"$RC"
  PATH_STATUS="added:$RC"
}
PATH_STATUS="present"
add_to_path "$INSTALL_DIR"

echo
echo "installed atc to ${INSTALL_DIR}/atc ($("$INSTALL_DIR/atc" --version 2>/dev/null || echo "$ASSET"))"
if [ -f "$PACKAGE_MARKER" ]; then
  # Two copies: whichever comes first on PATH runs, and only the package's follows system updates.
  echo "note: a $(cat "$PACKAGE_MARKER") package also installed atc in /usr/bin; with ${INSTALL_DIR} first on PATH"
  echo "      this copy shadows it. Keep one: remove the package, or ${INSTALL_DIR}/atc."
fi
case "$PATH_STATUS" in
  present) ;;
  manual) echo "add ${INSTALL_DIR} to your PATH: export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
  added:*) echo "PATH updated in ${PATH_STATUS#added:}; open a new terminal (or source it)" ;;
esac
echo
echo "next:"
echo "  atc                            # the terminal UI: choose a workspace, install an engine and a model"
echo "  atc doctor                     # check the machine"
echo "  atc service install            # keep the server running (systemd, launchd, Task Scheduler)"
