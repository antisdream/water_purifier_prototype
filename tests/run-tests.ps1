$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  node tests/requirements-v11.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "requirements-v11.test.mjs failed with exit code $LASTEXITCODE" }
  node tests/state-flow.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "state-flow.test.mjs failed with exit code $LASTEXITCODE" }
  python tests/smoke_test.py
  if ($LASTEXITCODE -ne 0) { throw "smoke_test.py failed with exit code $LASTEXITCODE" }
  Write-Host 'All SCREEN FIX v6 prototype checks: PASS' -ForegroundColor Green
}
finally {
  Pop-Location
}
