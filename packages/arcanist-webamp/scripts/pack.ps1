<#
.SYNOPSIS
    Builds Webamp for Arcanist's zip from this checkout: release/arcanist-webamp-<version>.zip and its .sha256.

.DESCRIPTION
    The zip is what Arcanist bundles (wwwroot/players/webamp) and what an administrator installs from the panel
    (Players, install from URL or upload). It is made as the GitHub workflow makes it (arcanist-webamp.yml): only this
    package and what it uses is installed, ani-cursor and winamp-eqf are built, then the player, then the zip
    (scripts/package.mjs, reproducible).

    By default it builds in Docker (Docker Desktop with Linux containers is all it needs; the pnpm store is cached
    in the volume arcanist-webamp-pnpm-store, and the checkout's node_modules are not touched). -Local builds with
    this machine's Node (mise's node@24.15.0 when there is mise) and pnpm 9.12.0 instead.

.EXAMPLE
    pwsh packages/arcanist-webamp/scripts/pack.ps1
.EXAMPLE
    pwsh packages/arcanist-webamp/scripts/pack.ps1 -Test          # also runs Webamp's tests, as the workflow does
.EXAMPLE
    pwsh packages/arcanist-webamp/scripts/pack.ps1 -Local
#>
[CmdletBinding()]
param(
    # Build with this machine's Node and pnpm instead of Docker.
    [switch]$Local,

    # Run Webamp's own tests before building.
    [switch]$Test
)

$ErrorActionPreference = 'Stop'
$package = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $package '../..')).Path
$release = Join-Path $package 'release'
$version = (Get-Content (Join-Path $package 'package.json') -Raw | ConvertFrom-Json).version
$started = Get-Date
Write-Host "Webamp for Arcanist $version" -ForegroundColor Green

function Invoke-Checked {
    $command, $rest = $args
    & $command @rest
    if ($LASTEXITCODE -ne 0) { throw "$($args -join ' ') failed (exit code $LASTEXITCODE)." }
}

$steps = @(
    'pnpm install --frozen-lockfile --filter "arcanist-webamp..."',
    'pnpm --filter ani-cursor --filter winamp-eqf run build'
)
if ($Test) { $steps += 'NODE_ENV=test pnpm --filter webamp test' }
$steps += 'pnpm --filter arcanist-webamp run build'
$steps += 'pnpm --filter arcanist-webamp run package'

if ($Local) {
    Push-Location $repo
    try {
        $node = if (Get-Command mise -ErrorAction SilentlyContinue) { @('mise', 'exec', 'node@24.15.0', '--') } else { @() }
        $pnpm = $node + @('npx', '--yes', 'pnpm@9.12.0')
        Invoke-Checked @pnpm install --frozen-lockfile --filter 'arcanist-webamp...'
        Invoke-Checked @pnpm --filter ani-cursor --filter winamp-eqf run build
        if ($Test) {
            $env:NODE_ENV = 'test'
            try { Invoke-Checked @pnpm --filter webamp test } finally { Remove-Item Env:NODE_ENV }
        }
        Invoke-Checked @pnpm --filter arcanist-webamp run build
        Invoke-Checked @pnpm --filter arcanist-webamp run package
    }
    finally {
        Pop-Location
    }
}
else {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is needed (or use -Local): install Docker Desktop and start it.' }
    & docker info --format '{{.OSType}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running: start Docker Desktop and try again.' }
    New-Item -ItemType Directory -Force $release | Out-Null

    # The checkout is copied into the container (without node_modules, .git or earlier builds), so its own
    # node_modules (Windows binaries) stay as they are; only the zip comes back.
    $script = (@(
        'set -e',
        'mkdir -p /work',
        'tar -C /src --exclude=node_modules --exclude=./.git --exclude=./packages/arcanist-webamp/dist --exclude=./packages/arcanist-webamp/release -cf - . | tar -C /work -xf -',
        'cd /work',
        'corepack enable >/dev/null && corepack prepare pnpm@9.12.0 --activate >/dev/null',
        'pnpm config set store-dir /pnpm-store >/dev/null'
    ) + $steps + @('cp packages/arcanist-webamp/release/* /out/')) -join ' && '
    Invoke-Checked docker run --rm -v "${repo}:/src:ro" -v "${release}:/out" -v arcanist-webamp-pnpm-store:/pnpm-store `
        -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 node:22-bookworm sh -c $script
}

$zip = Join-Path $release "arcanist-webamp-$version.zip"
if (-not (Test-Path $zip)) { throw "No $zip was made: see the output above." }
$sha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$elapsed = (Get-Date) - $started
Write-Host ''
Write-Host "Done in $([int]$elapsed.TotalMinutes) min $($elapsed.Seconds) s:" -ForegroundColor Green
Write-Host "  $zip ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"
Write-Host "  SHA-256 $sha"
