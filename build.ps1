# Assembles a loadable extension folder for each browser by combining the
# shared code in core/ with that browser's manifest.json.
#
# Usage:
#   .\build.ps1            # build chrome, edge and firefox
#   .\build.ps1 firefox    # build only the named browser(s)
#
# Output goes to dist\<browser>\ — point your browser's "load unpacked"
# (or "load temporary add-on") at that folder.
#
# If script execution is blocked, run once:
#   powershell -ExecutionPolicy Bypass -File .\build.ps1

param([string[]]$Browsers)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not $Browsers -or $Browsers.Count -eq 0) {
    $Browsers = @('chrome', 'edge', 'firefox')
}

foreach ($browser in $Browsers) {
    $manifest = Join-Path $browser 'manifest.json'
    if (-not (Test-Path $manifest)) {
        Write-Error "unknown browser '$browser' (no $manifest)"
    }

    $out = Join-Path 'dist' $browser
    if (Test-Path $out) {
        Remove-Item -Path $out -Recurse -Force
    }
    New-Item -ItemType Directory -Path $out -Force | Out-Null

    # Shared code (everything in core/ except the icon generator).
    foreach ($file in @('background.js', 'content.js', 'content.css', 'popup.html', 'popup.js')) {
        Copy-Item -Path (Join-Path 'core' $file) -Destination $out
    }
    Copy-Item -Path (Join-Path 'core' 'icons') -Destination (Join-Path $out 'icons') -Recurse

    # Browser-specific manifest.
    Copy-Item -Path $manifest -Destination (Join-Path $out 'manifest.json')

    Write-Host "built $out"
}
