$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  node tests/requirements-v11.test.mjs
  node tests/state-flow.test.mjs
  python tests/smoke_test.py
  Write-Host 'All SCREEN FIX v6 prototype checks: PASS' -ForegroundColor Green
}
finally {
  Pop-Location
}
