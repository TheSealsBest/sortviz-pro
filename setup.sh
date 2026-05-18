#!/bin/bash
# ============================================================
#  SortViz — setup.sh
#  Downloads header dependencies and compiles the server.
#  Usage: bash setup.sh
# ============================================================

set -e

# Colours
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "  ${CYAN}SortViz C++ Backend — Setup${NC}"
echo    "  ──────────────────────────────────────"
echo ""

# ── 1. Check for g++ ─────────────────────────────────────────
if ! command -v g++ &>/dev/null; then
  echo -e "  ${RED}ERROR: g++ not found.${NC}"
  echo    "  Install it first:"
  echo    "    Ubuntu/WSL:  sudo apt install g++ curl"
  echo    "    macOS:       xcode-select --install"
  exit 1
fi

GCC_VER=$(g++ --version | head -1)
echo -e "  ${GREEN}✓${NC} Found: $GCC_VER"

# ── 2. Check for curl ────────────────────────────────────────
if ! command -v curl &>/dev/null; then
  echo -e "  ${RED}ERROR: curl not found.${NC}"
  echo    "  Install: sudo apt install curl"
  exit 1
fi

# ── 3. Download httplib.h ─────────────────────────────────────
if [ ! -f "httplib.h" ]; then
  echo    "  Downloading httplib.h..."
  curl -fsSL \
    "https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h" \
    -o httplib.h
  echo -e "  ${GREEN}✓${NC} httplib.h downloaded"
else
  echo -e "  ${GREEN}✓${NC} httplib.h already present"
fi

# ── 4. Download json.hpp ─────────────────────────────────────
if [ ! -f "json.hpp" ]; then
  echo    "  Downloading json.hpp..."
  curl -fsSL \
    "https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp" \
    -o json.hpp
  echo -e "  ${GREEN}✓${NC} json.hpp downloaded"
else
  echo -e "  ${GREEN}✓${NC} json.hpp already present"
fi

# ── 5. Verify public/ structure ───────────────────────────────
echo ""
if [ ! -f "public/index.html" ]; then
  echo -e "  ${RED}WARNING:${NC} public/index.html not found."
  echo    "  Put the frontend files in:"
  echo    "    public/index.html"
  echo    "    public/css/main.css"
  echo    "    public/js/app.js"
  echo ""
else
  echo -e "  ${GREEN}✓${NC} public/index.html found"
fi

# ── 6. Compile ────────────────────────────────────────────────
echo    "  Compiling..."
g++ -o server main.cpp -std=c++17 -pthread -O2

echo ""
echo    "  ──────────────────────────────────────"
echo -e "  ${GREEN}Build complete!${NC}"
echo ""
echo    "  Start the server:  ./server"
echo    "  Open in browser:   http://localhost:8080"
echo    ""
echo    "  Endpoints:"
echo    "    /sort?algo=merge&size=50    → animation frames"
echo    "    /race?size=50               → parallel race (all algos)"
echo    "    /benchmark                  → chrono timing up to 1M"
echo    "    /ping                       → health check"
echo    "  ──────────────────────────────────────"
echo ""
