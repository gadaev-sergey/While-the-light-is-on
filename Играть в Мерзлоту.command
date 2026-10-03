#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  echo "Для запуска нужен Node.js 22.14 или новее."
  read -k 1
  exit 1
fi
node games/merzlota/launch.mjs
