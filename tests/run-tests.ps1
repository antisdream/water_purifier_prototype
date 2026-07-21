$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Get-ChildItem -LiteralPath (Join-Path $root "assets\js") -Filter "*.js" | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "JavaScript syntax check failed: $($_.FullName) (exit $LASTEXITCODE)"
    }
}

node (Join-Path $PSScriptRoot "state-flow.test.mjs")
if ($LASTEXITCODE -ne 0) {
    throw "State-flow tests failed (exit $LASTEXITCODE)"
}

node (Join-Path $PSScriptRoot "requirements-v11.test.mjs")
if ($LASTEXITCODE -ne 0) {
    throw "Requirements v11 tests failed (exit $LASTEXITCODE)"
}

python (Join-Path $PSScriptRoot "smoke_test.py")
if ($LASTEXITCODE -ne 0) {
    throw "Static smoke tests failed (exit $LASTEXITCODE)"
}

Write-Host "All prototype checks: PASS" -ForegroundColor Green
