# Lädt GraphHopper und den OSM-Kartenauszug nach routing/data/.
# Aufruf (im Ordner routing):  .\setup.ps1
# Mit -Aktualisieren wird der Kartenauszug neu geladen (Geofabrik aktualisiert täglich).

param(
	[switch]$Aktualisieren
)

$ErrorActionPreference = 'Stop'
$GraphHopperVersion = '11.1'
$JarUrl = "https://github.com/graphhopper/graphhopper/releases/download/$GraphHopperVersion/graphhopper-web-$GraphHopperVersion.jar"
$OsmUrl = 'https://download.geofabrik.de/europe/germany/nordrhein-westfalen/duesseldorf-regbez-latest.osm.pbf'

Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force data | Out-Null

# Java prüfen
$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) {
	Write-Host 'Java fehlt. Bitte installieren:  winget install EclipseAdoptium.Temurin.21.JRE' -ForegroundColor Red
	exit 1
}

$jar = "data/graphhopper-web-$GraphHopperVersion.jar"
if (-not (Test-Path $jar)) {
	Write-Host "Lade GraphHopper $GraphHopperVersion (ca. 47 MB) ..."
	curl.exe -L --fail --progress-bar -o $jar $JarUrl
	if ($LASTEXITCODE -ne 0) { throw 'Download von GraphHopper fehlgeschlagen.' }
} else {
	Write-Host "GraphHopper $GraphHopperVersion ist schon da."
}

$pbf = 'data/duesseldorf-regbez-latest.osm.pbf'
if ($Aktualisieren -or -not (Test-Path $pbf)) {
	Write-Host 'Lade Kartenauszug Regierungsbezirk Düsseldorf (ca. 210 MB) ...'
	curl.exe -L --fail --progress-bar -o $pbf $OsmUrl
	if ($LASTEXITCODE -ne 0) { throw 'Download des Kartenauszugs fehlgeschlagen.' }
	# Neue Karte → aufbereitete Daten verwerfen, damit sie beim nächsten Start neu entstehen
	if (Test-Path data/graph-cache) { Remove-Item -Recurse -Force data/graph-cache }
} else {
	Write-Host 'Kartenauszug ist schon da (neu laden mit: .\setup.ps1 -Aktualisieren).'
}

Write-Host 'Fertig. Starten mit:  .\start.ps1' -ForegroundColor Green
