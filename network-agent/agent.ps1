# Unique Market Network AI - read-only Windows LAN discovery prototype
# Run from PowerShell on the customer's/technician's Windows PC.
# This prototype intentionally does NOT modify device IP settings.

$ErrorActionPreference = 'SilentlyContinue'
$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
if (-not $cfg) { Write-Error 'No active IPv4 network found.'; exit 1 }

$ip = $cfg.IPv4Address.IPAddress
$prefix = $cfg.IPv4Address.PrefixLength
$gateway = $cfg.IPv4DefaultGateway.NextHop
$ifIndex = $cfg.InterfaceIndex

$neighbors = Get-NetNeighbor -InterfaceIndex $ifIndex -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -and $_.LinkLayerAddress -and $_.State -notin @('Unreachable','Incomplete') } |
  Select-Object IPAddress,LinkLayerAddress,State

$result = [ordered]@{
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  localIp = $ip
  prefixLength = $prefix
  gateway = $gateway
  interfaceIndex = $ifIndex
  devices = @($neighbors | ForEach-Object {
    [ordered]@{
      ip = $_.IPAddress
      mac = $_.LinkLayerAddress
      state = $_.State.ToString()
    }
  })
}

$result | ConvertTo-Json -Depth 5
