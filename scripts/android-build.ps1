# Baut die Android-App (signierte APK) - Aufruf: npm run android:apk
# Voraussetzung: JDK und Android-SDK unter C:\Users\<Name>\Android (siehe CLAUDE.md, Abschnitt Android-App)
# und der Signierschluessel samt Passwoertern in ~/.gradle/gradle.properties (nie im Repository).
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:USERPROFILE 'Android'
$env:JAVA_HOME = Join-Path $base 'jdk'
$env:ANDROID_HOME = Join-Path $base 'Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
	# Rahmen (capacitor.config.ts, Platzhalterseite) in das Android-Projekt uebernehmen
	npx cap sync android
	if ($LASTEXITCODE -ne 0) { throw 'cap sync fehlgeschlagen' }
	Push-Location (Join-Path $root 'android')
	try {
		& .\gradlew.bat assembleRelease
		if ($LASTEXITCODE -ne 0) { throw 'Gradle fehlgeschlagen' }
	} finally { Pop-Location }
	$apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
	$out = Join-Path $root 'android\Genuss-Radeln.apk'
	Copy-Item $apk $out -Force
	Write-Host "Fertig: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
} finally { Pop-Location }
