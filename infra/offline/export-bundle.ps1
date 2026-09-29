# Windows equivalent of export-bundle.sh. Run from the repository root:
#   powershell -File infra\offline\export-bundle.ps1 [-Version 0.1.0]
param([string]$Version = "0.1.0")
$ErrorActionPreference = "Stop"

$out = "dist\satsa-offline-$Version"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

$env:SATSA_VERSION = $Version
docker compose -f docker-compose.offline.yml --env-file .env.offline.example build
if ($LASTEXITCODE -ne 0) { throw "image build failed" }
docker pull postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw "pull failed" }

# docker save writes a plain tar; the load script accepts .tar as well as .tar.gz.
docker save -o "$out\satsa-images-$Version.tar" "satsa/api:$Version" "satsa/web:$Version" postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw "docker save failed" }

Copy-Item docker-compose.offline.yml, infra\offline\load-bundle.sh $out
# The bundle is used on Linux: write text files with LF endings and no BOM.
function Write-Lf([string]$Path, [string[]]$Lines) {
    [IO.File]::WriteAllText((Join-Path (Resolve-Path $out) $Path), ($Lines -join "`n") + "`n")
}
Write-Lf ".env.offline.example" ((Get-Content .env.offline.example) -replace '^SATSA_VERSION=.*', "SATSA_VERSION=$Version")

Write-Lf "SHA256SUMS" (Get-ChildItem -File -Force $out | Where-Object Name -ne "SHA256SUMS" | ForEach-Object {
    "{0}  ./{1}" -f (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower(), $_.Name
})

Write-Host "Bundle ready: $out"
Get-ChildItem -Force $out
