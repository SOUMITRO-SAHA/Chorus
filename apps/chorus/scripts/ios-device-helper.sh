#!/bin/bash

################################################################################
# iOS Device Helper Script
#
# This script helps manage and deploy to physical iOS devices connected via USB.
# It lists connected devices, allows device selection, and provides deployment
# commands.
#
# Usage:
#   ./scripts/ios-device-helper.sh              # Interactive mode
#   ./scripts/ios-device-helper.sh list         # List all devices
#   ./scripts/ios-device-helper.sh deploy       # Deploy to selected device
#   ./scripts/ios-device-helper.sh deploy <device-name-or-udid>
#
# Requirements:
#   - Xcode installed
#   - Physical iOS device connected via USB
#   - Device trusted in Xcode
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

################################################################################
# Helper Functions
################################################################################

print_header() {
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ Error: $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ Warning: $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

check_requirements() {
  print_info "Checking requirements..."

  # Check if Xcode is installed
  if ! command -v xcodebuild &>/dev/null; then
    print_error "Xcode not found. Please install Xcode from the App Store."
    exit 1
  fi

  if ! command -v xcrun &>/dev/null; then
    print_error "xcrun not found. Select the full Xcode installation with xcode-select."
    exit 1
  fi

  if ! command -v bun &>/dev/null; then
    print_error "Bun not found. Install Bun before using the Tauri iOS commands."
    exit 1
  fi

  print_success "All requirements met"
}

list_devices() {
  print_header "Connected iOS Devices"

  # Get list of connected devices
  DEVICES=$(xcrun xctrace list devices 2>&1 | grep -E "iPhone|iPad|iPod" | grep -v "Simulator" || true)

  if [ -z "$DEVICES" ]; then
    print_error "No physical iOS devices found connected via USB."
    echo ""
    print_info "Troubleshooting:"
    echo "  1. Make sure your device is connected via USB cable"
    echo "  2. Trust this computer on your device (Settings > General > About > Trust This Computer)"
    echo "  3. Make sure your device is unlocked"
    echo "  4. Check Xcode > Window > Devices and Simulators to see if your device appears"
    echo "  5. Try reconnecting the USB cable or using a different cable"
    return 1
  fi

  echo "$DEVICES" | while read -r line; do
    if [[ $line == *"iPhone"* || $line == *"iPad"* || $line == *"iPod"* ]]; then
      # Extract device name and UDID
      DEVICE_NAME=$(echo "$line" | sed -E 's/^[^"]*"([^"]+)".*$/\1/' | sed 's/ (.*$//')
      DEVICE_UDID=$(echo "$line" | sed -E 's/^.*\(([0-9A-F-]+)\).*$/\1/')
      if [[ $line == *"iPhone"* || $line == *"iPad"* || $line == *"iPod"* ]]; then
        echo -e "${GREEN}•${NC} $DEVICE_NAME"
        echo -e "  ${BLUE}UDID:${NC} $DEVICE_UDID"
      fi
    fi
  done

  echo ""

  return 0
}

select_device() {
  print_header "Select Device"

  if ! list_devices; then
    return 1
  fi

  echo ""
  echo "Available devices:"

  # Parse devices and create a numbered list
  DEVICE_ARRAY=()
  while IFS= read -r line; do
    if [[ $line == *"iPhone"* || $line == *"iPad"* || $line == *"iPod"* ]]; then
      DEVICE_NAME=$(echo "$line" | sed -E 's/^[^"]*"([^"]+)".*$/\1/' | sed 's/ (.*$//')
      DEVICE_UDID=$(echo "$line" | sed -E 's/^.*\(([0-9A-F-]+)\).*$/\1/')
      DEVICE_ARRAY+=("$DEVICE_NAME|$DEVICE_UDID")
    fi
  done <<<"$DEVICES"

  if [ ${#DEVICE_ARRAY[@]} -eq 0 ]; then
    print_error "No valid devices found"
    return 1
  fi

  # Display numbered list
  for i in "${!DEVICE_ARRAY[@]}"; do
    IFS='|' read -r NAME UDID <<<"${DEVICE_ARRAY[$i]}"
    echo -e "  ${GREEN}$((i + 1))${NC}) $NAME"
  done

  echo ""

  # If only one device, auto-select it
  if [ ${#DEVICE_ARRAY[@]} -eq 1 ]; then
    IFS='|' read -r NAME UDID <<<"${DEVICE_ARRAY[0]}"
    print_info "Auto-selecting the only connected device: $NAME"
    SELECTED_UDID="$UDID"
    SELECTED_NAME="$NAME"
    return 0
  fi

  # Prompt for selection
  read -p "Select device (1-${#DEVICE_ARRAY[@]}): " SELECTION

  if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt ${#DEVICE_ARRAY[@]} ]; then
    print_error "Invalid selection"
    return 1
  fi

  IFS='|' read -r NAME UDID <<<"${DEVICE_ARRAY[$((SELECTION - 1))]}"
  SELECTED_UDID="$UDID"
  SELECTED_NAME="$NAME"

  print_success "Selected: $NAME"

  return 0
}

deploy_to_device() {
  local TARGET_DEVICE="${1:-}"

  if [ ! -d "$PROJECT_ROOT/src-tauri/gen/apple" ]; then
    print_error "Tauri iOS project not initialized. Run: bun run ios:init"
    return 1
  fi

  if [ -z "$TARGET_DEVICE" ]; then
    if ! select_device; then
      return 1
    fi
    TARGET_DEVICE="$SELECTED_NAME"
  elif [[ "$TARGET_DEVICE" =~ ^[[:xdigit:]-]{20,}$ ]]; then
    local DEVICE_LINE
    DEVICE_LINE=$(xcrun xctrace list devices 2>&1 | grep -F "$TARGET_DEVICE" | grep -v "Simulator" | head -n 1 || true)
    if [ -z "$DEVICE_LINE" ]; then
      print_error "No connected physical iOS device matches $TARGET_DEVICE"
      return 1
    fi
    TARGET_DEVICE=$(echo "$DEVICE_LINE" | sed -E 's/^[[:space:]]*([^()]*) \([^()]*\) \([[:xdigit:]-]+\).*$/\1/' | sed 's/[[:space:]]*$//')
  fi

  print_header "Deploying to Device"
  print_info "Device: $TARGET_DEVICE"
  print_info "Building and installing through the Tauri iOS runner..."
  echo ""

  if bun run tauri ios run "$TARGET_DEVICE"; then
    print_success "Deployment completed."
  else
    print_error "Deployment failed. Check the Tauri iOS output above."
    return 1
  fi
}

show_device_info() {
  if ! select_device; then
    return 1
  fi

  print_header "Device Information"

  # Get detailed device info
  DEVICE_INFO=$(xcrun xctrace list devices 2>&1 | grep "$SELECTED_UDID" -A 5)

  echo "$DEVICE_INFO"
  echo ""

  print_info "For more details, open:"
  echo "  Xcode > Window > Devices and Simulators"
}

check_trust() {
  print_header "Device Trust Status"

  if ! list_devices; then
    return 1
  fi

  echo ""
  print_info "To trust this computer on your iOS device:"
  echo "  1. Open Settings on your iPhone/iPad"
  echo "  2. Go to General > About"
  echo "  3. Look for 'Trust This [Computer/Mac]'"
  echo "  4. Tap it and confirm"
  echo ""
  print_info "Then reconnect your device and run this script again."
}

################################################################################
# Main Menu
################################################################################

show_menu() {
  print_header "iOS Device Helper"
  echo ""
  echo "What would you like to do?"
  echo ""
  echo "  1) List connected devices"
  echo "  2) Deploy to device"
  echo "  3) Show device information"
  echo "  4) Check device trust status"
  echo "  5) Exit"
  echo ""
  read -p "Select option (1-5): " CHOICE

  case $CHOICE in
  1)
    list_devices
    ;;
  2)
    check_requirements
    deploy_to_device
    ;;
  3)
    show_device_info
    ;;
  4)
    check_trust
    ;;
  5)
    print_info "Goodbye!"
    exit 0
    ;;
  *)
    print_error "Invalid option"
    ;;
  esac

  echo ""
  read -p "Press Enter to continue..."
  show_menu
}

################################################################################
# Command Line Interface
################################################################################

# Parse command line arguments
case "${1:-}" in
list)
  check_requirements
  list_devices
  ;;
deploy)
  check_requirements
  deploy_to_device "${2:-}"
  ;;
info)
  show_device_info
  ;;
trust)
  check_trust
  ;;
help | --help | -h)
  print_header "iOS Device Helper - Help"
  cat <<EOF
Usage: $0 [command] [options]

Commands:
  list              List all connected iOS devices
  deploy [device]   Build and run through Tauri (interactive if omitted)
  info              Show detailed information about a selected device
  trust             Show instructions for trusting this computer
  help              Show this help message

Examples:
  $0 list                           # List all connected devices
  $0 deploy                         # Interactive device selection and deploy
  $0 deploy "My iPhone"             # Deploy to a device by name
  $0 deploy 00008030-XXXXXXXX       # Resolve a connected device UDID
  $0                                # Interactive menu

Requirements:
  - Xcode installed
  - Physical iOS device connected via USB
  - Device trusted in Xcode

EOF
  ;;
"")
  # No arguments - show interactive menu
  check_requirements
  show_menu
  ;;
*)
  print_error "Unknown command: $1"
  echo "Run '$0 help' for usage information"
  exit 1
  ;;
esac
