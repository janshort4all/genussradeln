# Startet GraphHopper lokal unter http://localhost:8989
# Aufruf (im Ordner routing):  .\start.ps1
# Mit -Neu werden die aufbereiteten Kartendaten verworfen und neu berechnet
# (nötig nach Änderungen an config.yml oder custom_models/genuss.json).

param(
	[switch]$Neu
)

$ErrorActionPreference = 'Stop'
$GraphHopperVersion = '11.1'

Set-Location $PSScriptRoot
$jar = "data/graphhopper-web-$GraphHopperVersion.jar"
if (-not (Test-Path $jar) -or -not (Test-Path data/duesseldorf-regbez-latest.osm.pbf)) {
	Write-Host 'Erst einrichten mit:  .\setup.ps1' -ForegroundColor Red
	exit 1
}

if ($Neu -and (Test-Path data/graph-cache)) {
	Write-Host 'Verwerfe aufbereitete Kartendaten ...'
	Remove-Item -Recurse -Force data/graph-cache
}

if (-not (Test-Path data/graph-cache)) {
	Write-Host 'Erster Start: Karte wird aufbereitet, das dauert einige Minuten.' -ForegroundColor Yellow
}
Write-Host 'GraphHopper läuft, sobald "Server - Started" erscheint. Beenden mit Strg+C.'

java -Xms1g -Xmx6g -jar $jar server config.yml
