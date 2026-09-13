# Unique Market Network AI — Windows Local Agent

This folder contains the local component required for real LAN discovery. A browser cannot safely perform privileged ARP/network configuration by itself.

## Design
- Read-only discovery first.
- Detect local IPv4/subnet and gateway.
- Enumerate ARP neighbors and reachability.
- Identify likely CCTV devices using MAC vendor + common CCTV ports.
- Future ONVIF discovery and vendor-specific configuration are opt-in modules.
- Any IP change requires explicit confirmation and a safety check.

## Safety
The agent must never automatically change a router, PC, printer, DHCP server, or unknown device. Camera IP assignment is allowed only after the target device is positively identified and the proposed address is verified unused.

The web UI communicates with the local agent over localhost only. Authentication and an origin allow-list should be enabled before production deployment.
