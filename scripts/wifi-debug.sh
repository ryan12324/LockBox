#!/bin/bash

ADB="/mnt/c/Users/ryan1/AppData/Local/Android/Sdk/platform-tools/adb.exe"

if [ ! -f "$ADB" ]; then
    echo "Error: Windows adb.exe not found at $ADB"
    exit 1
fi

echo "=========================================="
echo "    Lockbox Android Wi-Fi Debugger        "
echo "=========================================="
echo ""
echo "1. On your phone, go to Developer Options > Wireless Debugging"
echo "2. Tap 'Pair device with pairing code'"
echo ""
read -p "Enter the pairing IP:PORT (e.g., 192.168.1.100:43210): " PAIR_ADDRESS
read -p "Enter the 6-digit Wi-Fi pairing code: " PAIR_CODE

echo ""
echo "Pairing with device..."
$ADB pair $PAIR_ADDRESS $PAIR_CODE

echo ""
echo "=========================================="
echo "3. Now look at the MAIN Wireless Debugging screen"
echo "   It will show a different IP and Port for connection."
echo ""
read -p "Enter the connection IP:PORT (e.g., 192.168.1.100:38555): " CONN_ADDRESS

echo ""
echo "Connecting to device..."
$ADB connect $CONN_ADDRESS

echo ""
echo "=========================================="
echo "Installing debug APK to your phone..."
$ADB -s $CONN_ADDRESS install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk

echo ""
echo "Installation complete! Launching app and streaming logs..."
echo "(Press Ctrl+C to stop logging)"
echo "------------------------------------------"

# Try to launch the app automatically using monkey
$ADB -s $CONN_ADDRESS shell monkey -p dev.lockbox.app -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1

# Stream the logs filtering for lockbox
$ADB -s $CONN_ADDRESS logcat | grep dev.lockbox
