$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Building Unique Market Network Agent...' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required for the build. Install Node.js LTS first.' }

npm install
npx @yao-pkg/pkg@6.7.0 agent.js --targets node20-win-x64 --output UniqueMarketNetworkAgent.exe

Write-Host ''
Write-Host 'Build complete: network-agent\UniqueMarketNetworkAgent.exe' -ForegroundColor Green
