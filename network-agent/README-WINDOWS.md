# Unique Market Network AI Agent — Windows

## Field PC setup
1. Copy the `network-agent` folder to the site PC.
2. Run `install-agent.bat`.
3. The agent listens only on `127.0.0.1:17855`, so it is not exposed as a LAN service.
4. Open `https://salesuniquemarket.com/network-ai` on the same PC and click **Connect Agent**.
5. Run a scan before making any IP changes.

## Build a standalone EXE
Run PowerShell as a normal user and execute:

```powershell
.\build-agent.ps1
```

The generated executable is `UniqueMarketNetworkAgent.exe`.

## Important
The EXE packaging removes the need to keep a Node command window open, but camera IP changes still depend on the camera's ONVIF implementation and valid administrator credentials. Always verify the camera at its new IP after a change.
