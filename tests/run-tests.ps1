$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  node tests/screen-design-v13.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "screen-design-v13.test.mjs failed with exit code $LASTEXITCODE" }
  node tests/counselor-render.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "counselor-render.test.mjs failed with exit code $LASTEXITCODE" }
  node tests/requirements-v11.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "requirements-v11.test.mjs failed with exit code $LASTEXITCODE" }
  node tests/state-flow.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "state-flow.test.mjs failed with exit code $LASTEXITCODE" }
  python tests/smoke_test.py
  if ($LASTEXITCODE -ne 0) { throw "smoke_test.py failed with exit code $LASTEXITCODE" }
  Write-Host 'All SCREEN DESIGN v13 prototype checks: PASS' -ForegroundColor Green
}
finally {
  Pop-Location
}
