#!/usr/bin/env bash
set -euo pipefail

PURPLE='\033[1;95m'
CYAN='\033[1;96m'
GREEN='\033[1;92m'
YELLOW='\033[1;93m'
RED='\033[1;91m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$PWD/package.json" ]]; then
  ROOT_DIR="$PWD"
elif [[ -f "$PWD/../package.json" ]]; then
  ROOT_DIR="$(cd "$PWD/.." && pwd)"
else
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
ENV_FILE="$ROOT_DIR/.env"

print_header() {
  printf "${PURPLE}"
  cat <<'BANNER'
██████╗  █████╗  ██████╗ ██████╗  █████╗ ███████╗
██╔══██╗██╔══██╗██╔════╝ ██╔══██╗██╔══██╗╚══███╔╝
██████╔╝███████║██║  ███╗██████╔╝███████║  ███╔╝
██╔══██╗██╔══██║██║   ██║██╔══██╗██╔══██║ ███╔╝
██║  ██║██║  ██║╚██████╔╝██████╔╝██║  ██║███████╗
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
BANNER
  printf "${RESET}"
  printf "${CYAN}Project root:${RESET} %s\n\n" "$ROOT_DIR"
}

run_in_root() {
  (cd "$ROOT_DIR" && "$@")
}

pause() {
  read -r -p "Press Enter to continue..." _
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\/&]/\\&/g'
}

set_env_key() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(escape_sed "$value")"

  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

get_env_value() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d '=' -f2-
  fi
}

setup_env() {
  printf "${BOLD}Environment setup${RESET}\n"
  if [[ ! -f "$ENV_FILE" && -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
    printf "${GREEN}Created .env from .env.example${RESET}\n"
  else
    touch "$ENV_FILE"
  fi

  local wp_url admin_emails admin_passwords auth_secret
  wp_url="$(get_env_value NEXT_PUBLIC_WORDPRESS_URL)"
  admin_emails="$(get_env_value ADMIN_EMAILS)"
  admin_passwords="$(get_env_value ADMIN_PASSWORDS)"
  auth_secret="$(get_env_value AUTH_SECRET)"

  read -r -p "WordPress URL [${wp_url:-https://www.example.com/}]: " input
  set_env_key "NEXT_PUBLIC_WORDPRESS_URL" "${input:-${wp_url:-https://www.example.com/}}"

  read -r -p "Admin emails (comma-separated) [${admin_emails:-admin@example.com}]: " input
  set_env_key "ADMIN_EMAILS" "${input:-${admin_emails:-admin@example.com}}"

  read -r -p "Admin passwords (comma-separated, same order) [${admin_passwords:-change-this-password}]: " input
  set_env_key "ADMIN_PASSWORDS" "${input:-${admin_passwords:-change-this-password}}"

  read -r -p "AUTH_SECRET [${auth_secret:-replace-with-a-long-random-secret}]: " input
  set_env_key "AUTH_SECRET" "${input:-${auth_secret:-replace-with-a-long-random-secret}}"

  printf "${GREEN}Updated %s${RESET}\n" "$ENV_FILE"
}

setup_theme_defaults() {
  printf "${BOLD}Write nice default theme.json?${RESET} (y/N): "
  read -r answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    printf "Skipped.\n"
    return
  fi

  cat > "$ROOT_DIR/theme.json" <<'JSON'
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "color": {
      "palette": [
        { "slug": "background", "name": "Background", "color": "#f8f7f4" },
        { "slug": "foreground", "name": "Foreground", "color": "#1f2937" },
        { "slug": "primary", "name": "Primary", "color": "#0f766e" },
        { "slug": "muted", "name": "Muted", "color": "#64748b" }
      ]
    },
    "typography": {
      "fontFamilies": [
        {
          "slug": "body",
          "name": "Body",
          "fontFamily": "var(--font-nunito), \"Segoe UI\", sans-serif"
        },
        {
          "slug": "heading",
          "name": "Heading",
          "fontFamily": "var(--font-montserrat), \"Helvetica Neue\", sans-serif"
        }
      ]
    }
  }
}
JSON
  run_in_root npm run theme:css
  printf "${GREEN}theme.json written and CSS regenerated.${RESET}\n"
}

preflight() {
  printf "${BOLD}Running preflight checks...${RESET}\n"

  local failed=0
  for cmd in node npm git; do
    if command -v "$cmd" >/dev/null 2>&1; then
      printf "${GREEN}OK${RESET} %s\n" "$cmd"
    else
      printf "${RED}MISSING${RESET} %s\n" "$cmd"
      failed=1
    fi
  done

  if command -v wrangler >/dev/null 2>&1; then
    printf "${GREEN}OK${RESET} wrangler\n"
  else
    printf "${YELLOW}WARN${RESET} wrangler not installed (needed for Cloudflare preview/deploy).\n"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    printf "${GREEN}OK${RESET} .env found\n"
  else
    printf "${YELLOW}WARN${RESET} .env missing. Run env setup first.\n"
  fi

  if [[ $failed -ne 0 ]]; then
    printf "${RED}Preflight failed due to missing required tools.${RESET}\n"
    return 1
  fi

  run_in_root npm run theme:css
  run_in_root npm run test:theme
  printf "${GREEN}Preflight complete.${RESET}\n"
}

choose_develop() {
  printf "\n${BOLD}Develop options${RESET}\n"
  printf "1) next dev\n"
  printf "2) cf preview (OpenNext + wrangler dev)\n"
  printf "3) Back\n"
  read -r -p "Select: " choice
  case "$choice" in
    1) run_in_root npm run dev ;;
    2) run_in_root npm run cf:preview ;;
    *) return ;;
  esac
}

choose_build() {
  printf "\n${BOLD}Build options${RESET}\n"
  printf "1) next build\n"
  printf "2) cf build\n"
  printf "3) both\n"
  printf "4) Back\n"
  read -r -p "Select: " choice
  case "$choice" in
    1) run_in_root npm run build ;;
    2) run_in_root npm run cf:build ;;
    3) run_in_root npm run build && run_in_root npm run cf:build ;;
    *) return ;;
  esac
}

choose_deploy() {
  printf "\n${BOLD}Deploy options${RESET}\n"
  printf "1) Cloudflare deploy\n"
  printf "2) Back\n"
  read -r -p "Select: " choice
  case "$choice" in
    1)
      read -r -p "Proceed with npm run cf:deploy? (y/N): " answer
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        run_in_root npm run cf:deploy
      else
        printf "Deploy cancelled.\n"
      fi
      ;;
    *) return ;;
  esac
}

full_pipeline() {
  preflight
  run_in_root npm run cf:build
  read -r -p "Deploy after successful build? (y/N): " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    run_in_root npm run cf:deploy
  fi
}

main_menu() {
  while true; do
    clear || true
    print_header
    printf "${BOLD}Menu${RESET}\n"
    printf "1) Setup environment (.env)\n"
    printf "2) Setup theme.json defaults\n"
    printf "3) Preflight\n"
    printf "4) Develop\n"
    printf "5) Build\n"
    printf "6) Deploy\n"
    printf "7) Full pipeline (preflight + build + optional deploy)\n"
    printf "8) Exit\n\n"

    read -r -p "Select an option: " option
    case "$option" in
      1) setup_env; pause ;;
      2) setup_theme_defaults; pause ;;
      3) preflight || true; pause ;;
      4) choose_develop; pause ;;
      5) choose_build; pause ;;
      6) choose_deploy; pause ;;
      7) full_pipeline || true; pause ;;
      8) break ;;
      *) printf "${YELLOW}Invalid option.${RESET}\n"; pause ;;
    esac
  done
}

main_menu
