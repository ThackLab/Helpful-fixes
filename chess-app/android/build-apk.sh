#!/usr/bin/env bash
# Builds a sideloadable Android APK of Outpost Chess without the Android SDK
# or Gradle: aapt2 (shipped inside Apktool) packages the resources and the web
# app, javac + d8 compile the WebView wrapper, and uber-apk-signer aligns and
# signs it. Needs: JDK 17+, node/npm, curl, unzip, zip.
#
#   chess-app/android/build-apk.sh            -> chess-app/android/build/outpost-chess.apk
#   KEYSTORE=my.jks KS_PASS=... KEY_ALIAS=... KEY_PASS=... build-apk.sh   (release key)
#
# Without KEYSTORE the APK is signed with uber-apk-signer's public debug key,
# which is fine for installing on your own phone (and keeps updates
# installable), but not for publishing.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
TOOLS="$HERE/.tools"
BUILD="$HERE/build"
MIN_SDK=24
TARGET_SDK=34

mkdir -p "$TOOLS"
fetch() {
  [ -s "$TOOLS/$1" ] || curl -fsSL --retry 3 -o "$TOOLS/$1" "$2"
}
fetch android-34.jar https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fetch r8lib.jar https://storage.googleapis.com/r8-releases/raw/8.5.35/r8lib.jar
fetch apktool.jar https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar
fetch uber-apk-signer.jar https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar
(cd "$TOOLS" && sha256sum --quiet -c "$HERE/tools.sha256")
if [ ! -x "$TOOLS/aapt2" ]; then
  unzip -p "$TOOLS/apktool.jar" prebuilt/linux/aapt2_64 > "$TOOLS/aapt2"
  chmod +x "$TOOLS/aapt2"
fi
ANDROID_JAR="$TOOLS/android-34.jar"

VERSION_NAME="$(node -p "require('$APP/package.json').version")"
VERSION_CODE="$(git -C "$APP" rev-list --count HEAD 2>/dev/null || echo 1)"

echo "[apk] building the web app"
(cd "$APP" && npm run build --silent)

rm -rf "$BUILD"
mkdir -p "$BUILD/assets/www" "$BUILD/classes" "$BUILD/dex" "$BUILD/gen"
cp -r "$APP/dist/." "$BUILD/assets/www/"
# The WebView is never cross-origin isolated, so the multi-threaded engine is
# unused; the app also serves itself from the APK and needs no service worker.
rm -f "$BUILD/assets/www/engine/stockfish-18-lite.js" "$BUILD/assets/www/engine/stockfish-18-lite.wasm" "$BUILD/assets/www/sw.js"

echo "[apk] packaging resources"
"$TOOLS/aapt2" compile --dir "$HERE/res" -o "$BUILD/res.zip"
"$TOOLS/aapt2" link -I "$ANDROID_JAR" --manifest "$HERE/AndroidManifest.xml" -A "$BUILD/assets" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$BUILD/gen" -o "$BUILD/unsigned.apk" "$BUILD/res.zip"

echo "[apk] compiling the wrapper"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$BUILD/classes" \
  $(find "$HERE/src" "$BUILD/gen" -name '*.java')
java -cp "$TOOLS/r8lib.jar" com.android.tools.r8.D8 --release --min-api "$MIN_SDK" --lib "$ANDROID_JAR" \
  --output "$BUILD/dex" $(find "$BUILD/classes" -name '*.class')
(cd "$BUILD/dex" && zip -q -X "$BUILD/unsigned.apk" classes.dex)

echo "[apk] aligning and signing"
SIGN_ARGS=(--apks "$BUILD/unsigned.apk" --out "$BUILD/signed" --allowResign)
if [ -n "${KEYSTORE:-}" ]; then
  SIGN_ARGS+=(--ks "$KEYSTORE" --ksPass "$KS_PASS" --ksAlias "$KEY_ALIAS" --ksKeyPass "$KEY_PASS")
fi
java -jar "$TOOLS/uber-apk-signer.jar" "${SIGN_ARGS[@]}" > "$BUILD/sign.log"
cp "$(find "$BUILD/signed" -name '*.apk' | head -1)" "$BUILD/outpost-chess.apk"
echo "[apk] done: $BUILD/outpost-chess.apk ($(du -h "$BUILD/outpost-chess.apk" | cut -f1), version $VERSION_NAME / $VERSION_CODE)"
