# Task — Local Network Access for Windows Electron

## Status

Planned.

## Depends on

`docs/issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md`

This task must be implemented only after the Windows Electron runtime exists and the desktop application can reliably start the existing Express backend with a persistent SQLite database.

## Goal

Add an opt-in **Local Network Access** mode to the Windows Electron build so the user can access the same Inventory Atlas Lite instance from a phone, tablet, or another computer on the same local network.

Expected UX:

```text
Inventory Atlas Lite for Windows
        ↓
Settings → Local Network Access
        ↓
Start local network access
        ↓
http://192.168.1.74:3000
        ↓
QR code / Copy address
        ↓
open from phone
        ↓
same inventory / same SQLite database
```

This is a production-quality feature, not a temporary development server.

Implement it as one task with two internal implementation stages:

1. **LAN runtime and desktop controls**
2. **Pairing/security and UX hardening**

Both stages are required for task completion. Do not ship an unauthenticated LAN listener as the final implementation.

---

# Core architecture

Keep **one Inventory Atlas backend and one SQLite database**.

Do not start a second backend process or a second database connection set only for LAN clients.

Target concept:

```text
                    ┌──────────────────────┐
                    │ Electron desktop app │
                    └──────────┬───────────┘
                               │
                       local-only runtime
                               │
                    ┌──────────▼───────────┐
                    │ Existing Express app │
                    │ Existing SQLite DB   │
                    └──────────┬───────────┘
                               │
                  optional LAN listener/gateway
                               │
                  ┌────────────┴────────────┐
                  │                         │
             phone browser             tablet/laptop
```

The Electron desktop backend must remain local-only by default as required by the Windows Electron task.

LAN exposure must be explicit and independently startable/stoppable.

Do not permanently change desktop mode from:

```text
127.0.0.1
```

to:

```text
0.0.0.0
```

just to implement this feature.

Prefer a separate LAN listener/gateway around the same Express application instance, or an equivalent design that keeps desktop-local access isolated while LAN access can be enabled and disabled at runtime.

---

# 1. Default behavior

Local Network Access must be **OFF by default**.

Normal Electron launch:

```text
Electron
  ↓
local backend
  ↓
127.0.0.1 only
```

No LAN interface must be exposed until the user explicitly enables the feature.

The self-hosted Docker/Proxmox deployment behavior must not be changed by this task.

This feature is specific to the Electron desktop runtime.

---

# 2. Settings UI

Add a section:

```text
Settings
└── Local Network Access
```

Minimum UI:

```text
Local Network Access

Status: Stopped

[ Start local network access ]
```

When running:

```text
Local Network Access

Status: Running
Network: Wi-Fi
Address: http://192.168.1.74:3000

[ QR code ]

[ Copy address ] [ Stop ]

Connected / paired devices: 1
```

Use existing Tabler components and project design patterns.

Do not build a separate desktop-only visual design system.

---

# 3. Start / Stop lifecycle

The feature must support runtime control without restarting Inventory Atlas.

Expected:

```text
Start
  ↓
resolve usable LAN interface
  ↓
resolve port
  ↓
start LAN listener
  ↓
generate/display connection URL
  ↓
display QR code
```

Stop:

```text
Stop
  ↓
stop accepting LAN connections
  ↓
close LAN listener cleanly
  ↓
desktop Inventory Atlas continues running
```

Stopping LAN access must not:

- close Electron;
- stop the local desktop backend;
- close the database;
- lose data;
- require application restart.

Do not leave orphan listeners after Electron exits.

---

# 4. Network interface detection

Use Node network APIs such as `os.networkInterfaces()` or an equivalent maintained approach.

Automatically detect usable IPv4 interfaces.

Default automatic selection should prefer normal private LAN addresses:

```text
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
```

Ignore by default:

- loopback;
- link-local/APIPA addresses;
- unusable/down interfaces;
- obviously virtual interfaces where they can be identified safely.

Do not expose on every interface by default.

Prefer binding to the selected LAN address, for example:

```text
192.168.1.74
```

rather than blindly binding to:

```text
0.0.0.0
```

If more than one suitable interface exists, provide an **Advanced** interface selector.

Example:

```text
Network interface
[ Automatic (recommended) ▼ ]

Wi-Fi      192.168.1.74
Ethernet   192.168.0.15
```

A VPN/Tailscale/virtual interface must not silently become the default LAN interface if a normal private LAN interface is available.

---

# 5. IP changes

Handle common network changes gracefully.

Examples:

- Wi-Fi reconnect;
- DHCP address change;
- switching Wi-Fi networks;
- Ethernet connected/disconnected;
- laptop sleep/resume.

If the active address becomes invalid:

- update the feature state;
- attempt a safe rebind when appropriate;
- update the displayed URL and QR code;
- show a useful error if automatic recovery is not possible.

Do not leave the UI showing a stale address as if it were active.

---

# 6. Port handling

Do not assume one fixed port is always available.

Use a preferred LAN port, for example:

```text
3000
```

but verify availability before binding.

If unavailable:

- automatically select another available port from a small reasonable range; or
- use another deterministic safe fallback.

Always show the real active port.

Advanced settings may allow a custom preferred port.

Example:

```text
Preferred port
[ 3000 ]
```

Invalid ports must be rejected.

Port conflicts must produce a user-facing error, not a crash.

---

# 7. QR code

Generate a QR code for connecting from a phone.

The project already includes:

```text
qrcode-generator
```

Reuse it unless there is a strong technical reason not to.

The QR must point to the active LAN connection flow.

Do not generate a QR from a stale IP/port.

The QR must update when:

- IP changes;
- port changes;
- pairing credentials are rotated.

Provide:

```text
[ Show QR code ]
[ Copy address ]
```

---

# 8. Pairing / access protection

The final feature must not expose the entire inventory API anonymously to everyone on the LAN.

Implement lightweight pairing suitable for a personal trusted-LAN application.

Required behavior:

```text
new browser
   ↓
LAN URL
   ↓
pairing required
   ↓
approve using QR or short pairing code
   ↓
browser becomes trusted
   ↓
Inventory Atlas opens
```

Recommended UX:

### QR path

The QR contains a short-lived one-time pairing token.

Scanning it:

```text
/connect?token=<one-time-token>
```

must:

1. validate the token;
2. create a trusted browser session;
3. redirect to a clean URL without the token;
4. invalidate the one-time token.

Do not leave reusable secrets in the browser URL.

### Manual path

Opening the plain address manually should show a pairing screen:

```text
Enter pairing code

[ _ _ _ _ _ _ ]

[ Pair ]
```

The current code is visible in the Electron Local Network Access panel.

Use a cryptographically secure random source.

Do not use predictable codes based on timestamps, IP addresses, or Math.random().

---

# 9. Trusted browser sessions

After pairing, the browser should stay paired across normal page reloads.

Use a random opaque session identifier.

Prefer an `HttpOnly` cookie for the browser session.

Because LAN access is HTTP in this task, do not falsely claim transport-level security.

Use appropriate cookie restrictions that are valid for this environment, e.g. `HttpOnly` and `SameSite`.

Do not put a permanent access token in:

- query parameters;
- frontend source;
- HTML;
- application logs.

Persist only what is required for trusted-device/session management.

Sensitive pairing/session data must live in the Electron application data directory, not in the repository or packaged application resources.

---

# 10. Pairing management

The Electron settings panel must provide basic management.

Minimum:

```text
Paired devices

iPhone / Safari
Last seen: ...
[ Revoke ]

[ Revoke all devices ]
```

Device names may be derived conservatively from browser/user-agent information.

Do not attempt invasive device fingerprinting.

At minimum track:

- internal session/device id;
- created time;
- last seen time;
- optional friendly browser/device label.

Revoking a device must immediately invalidate future requests using its session.

Provide:

```text
[ Generate new pairing code ]
```

or equivalent rotation behavior.

---

# 11. LAN authentication boundary

Pairing protection must be enforced server-side.

Hiding the UI is not sufficient.

Unauthenticated LAN clients must not be able to call application APIs directly.

Protect:

```text
/api/*
```

and application pages/resources as appropriate for the chosen pairing flow.

The local Electron client must continue to work without LAN pairing.

Keep the security distinction explicit:

```text
local Electron listener
    → trusted local runtime

LAN listener/gateway
    → pairing/session guard
    → same Inventory Atlas Express app
```

Do not add a public endpoint that allows arbitrary LAN clients to enable/disable LAN access.

Start/Stop/configuration control belongs to the Electron control plane.

---

# 12. Electron IPC / control plane

Use Electron's secure renderer/main-process model.

Keep:

```text
nodeIntegration = false
contextIsolation = true
```

If the Vue UI needs desktop networking controls, expose only narrow methods through the preload bridge.

Example conceptual API:

```text
window.desktop.localNetwork.status()
window.desktop.localNetwork.start()
window.desktop.localNetwork.stop()
window.desktop.localNetwork.updateSettings(...)
window.desktop.localNetwork.revokeDevice(...)
```

Exact naming may differ.

Do not expose:

- unrestricted Node APIs;
- filesystem access;
- arbitrary process execution;
- arbitrary socket creation.

Remote browser clients must not receive the Electron preload bridge.

When the same Vue frontend runs in a normal browser, desktop-only Local Network Access controls must be hidden or disabled cleanly.

---

# 13. Persistence

Persist Local Network Access preferences in the Electron user data directory.

Persist at least:

- preferred interface mode (`automatic` or explicit interface);
- preferred port;
- paired-device/session state;
- optional auto-start setting.

Recommended setting:

```text
Start Local Network Access automatically with Inventory Atlas
[ off ]
```

Keep this OFF by default.

If the user enables auto-start, LAN access may start automatically on later launches using the saved safe configuration.

If startup binding fails, Electron must still open normally and show the LAN feature as failed/stopped.

A LAN error must never prevent local Inventory Atlas from starting.

---

# 14. Windows Firewall behavior

Do not silently execute `netsh`, PowerShell firewall commands, or require administrator privileges just to use this feature.

The application may trigger the normal Windows Firewall prompt when first accepting inbound LAN connections.

Provide a clear troubleshooting message if the phone cannot connect:

```text
Make sure this PC and phone are on the same network and allow
Inventory Atlas Lite through Windows Defender Firewall on Private networks.
```

Do not recommend enabling access on Public networks by default.

Document firewall troubleshooting.

---

# 15. Connection status

Expose useful runtime status in the desktop UI.

States should include at least:

```text
Stopped
Starting
Running
Error
```

Running state must show:

- selected network/interface;
- current IP;
- current port;
- connection URL;
- pairing code/QR action;
- paired-device count.

Errors should be actionable.

Examples:

```text
No usable local network interface found.
Port 3000 is unavailable.
Network interface disappeared.
Unable to start LAN listener.
```

Do not expose raw stack traces to normal users.

---

# 16. Client activity

Track lightweight activity for paired clients.

The UI may show:

```text
Paired devices: 2
Active recently: 1
```

"Active" can be based on recent authenticated request activity.

Do not add WebSockets only for this counter unless already justified by the architecture.

Polling or event updates through the existing Electron control path are sufficient.

---

# 17. Same application behavior

A paired phone/tablet must use the same Vue frontend and the same application data.

Do not build:

- a second mobile frontend;
- a second REST API;
- a second SQLite file;
- sync logic between desktop and mobile.

Changes made from the phone must appear in the desktop application because both clients use the same backend/database.

Existing application behavior should continue to work, including normal inventory operations and photo uploads.

---

# 18. Concurrent access

Validate normal simultaneous usage from:

```text
Electron desktop
+
one or more paired browsers
```

The implementation must not create duplicate backend processes that open competing independent application states.

Keep all clients routed to the same running backend/application services.

Do not add database synchronization.

---

# 19. HTTP / HTTPS scope

For this task, normal LAN access may use:

```text
http://192.168.x.x:<port>
```

Do not implement fake HTTPS with an untrusted self-signed certificate just to display `https://`.

A self-signed certificate that the phone does not trust is not a clean solution.

Document the limitation:

Browser APIs that require a **secure context**, especially live camera access through `getUserMedia()`, may not work when the app is opened from a LAN IP over plain HTTP.

This does **not** block normal inventory CRUD or standard file/photo upload flows.

Trusted HTTPS / secure-context LAN access is a separate future task if required.

Do not expand this task into certificate-authority installation, mDNS certificates, or automatic device trust management.

---

# 20. Optional friendly hostname

Do not make mDNS/Bonjour a requirement.

If a stable implementation is trivial after the core feature works, the app may additionally advertise a friendly local hostname such as:

```text
http://inventory-atlas.local:<port>
```

However:

- IP + port must remain the canonical fallback;
- QR must always contain a working address;
- mDNS failure must not break LAN access.

This is optional and must not block task completion.

---

# 21. Network loss / sleep / shutdown

Handle lifecycle events cleanly.

On application exit:

```text
stop LAN listener
↓
invalidate in-memory pairing challenges
↓
close desktop backend
↓
exit
```

On sleep/resume or interface change:

- verify current bind;
- refresh status;
- rebind if required;
- update QR/address.

No orphan listeners or background server processes may remain after Electron exits.

---

# 22. Tests

Add automated coverage for logic that can be tested without a physical phone.

At minimum test:

### Network selection

- private IPv4 detection;
- loopback exclusion;
- automatic preferred-interface selection;
- no-interface result;
- explicit interface selection.

### Port handling

- preferred port available;
- preferred port occupied;
- fallback port selection;
- invalid configured port.

### Pairing

- secure pairing challenge creation;
- invalid/expired token rejection;
- valid one-time token acceptance;
- token cannot be reused;
- session creation;
- session validation;
- revoke one device;
- revoke all devices.

### Access boundary

- local desktop path remains usable;
- unauthenticated LAN API request is rejected;
- paired LAN client can access API;
- revoked session is rejected.

### Lifecycle

- start LAN access;
- repeated start is safe/idempotent;
- stop LAN access;
- repeated stop is safe/idempotent;
- local desktop backend remains alive after LAN stop.

Do not make tests depend on the developer machine having a specific `192.168.x.x` address.

Mock interface discovery where appropriate.

---

# 23. Manual verification

Test on a real Windows machine with the packaged Electron application.

Scenario:

1. Install/run Inventory Atlas Lite.
2. Confirm the desktop application works with Local Network Access OFF.
3. From another device on the same Wi-Fi, confirm the desktop backend is not reachable before enabling LAN access.
4. Open `Settings → Local Network Access`.
5. Start LAN access.
6. Confirm a valid LAN IP and port are displayed.
7. Confirm QR code is displayed.
8. Scan the QR using a phone.
9. Complete pairing.
10. Confirm Inventory Atlas opens on the phone.
11. Add an item from the phone.
12. Confirm the item appears in the desktop UI.
13. Edit the same item from the desktop.
14. Confirm the updated data is visible on the phone after normal refresh/navigation.
15. Upload a photo from the phone.
16. Confirm it is stored and visible on desktop.
17. Open the plain LAN URL in a new unpaired browser.
18. Confirm direct inventory/API access is blocked until pairing.
19. Pair the second browser using the short code.
20. Confirm both clients work.
21. Revoke one paired device.
22. Confirm the revoked browser loses API access.
23. Stop Local Network Access.
24. Confirm LAN clients can no longer connect.
25. Confirm Electron desktop continues working normally.
26. Restart Electron.
27. Confirm LAN access remains OFF unless auto-start was explicitly enabled.
28. If auto-start is enabled, restart again and verify LAN access returns safely.
29. Change Wi-Fi network or reconnect and verify the shown address updates or a useful error is displayed.
30. Verify Setup and Portable Windows builds both behave correctly.

---

# 24. Documentation

Update relevant project documentation with:

- what Local Network Access does;
- how to enable/disable it;
- how QR pairing works;
- how manual pairing works;
- same-network requirement;
- Windows Firewall Private network note;
- how to revoke paired devices;
- security limitations of plain LAN HTTP;
- secure-context/live-camera limitation;
- troubleshooting for IP/port changes.

Do not describe LAN mode as internet-accessible.

Do not instruct users to port-forward the router.

---

# 25. Out of scope

Do not implement in this task:

- internet/public remote access;
- router port forwarding;
- UPnP/NAT traversal;
- cloud relay;
- cloud synchronization;
- multiple SQLite replicas;
- Android/iOS native applications;
- separate mobile frontend;
- trusted HTTPS certificate provisioning;
- Tailscale automation;
- VPN setup;
- QR item-scanner changes;
- Windows service mode;
- running Inventory Atlas when the Windows user is logged out.

These require separate tasks.

---

# Acceptance criteria

The task is complete when all of the following are true:

- [ ] Local Network Access exists in the packaged Windows Electron build.
- [ ] It is OFF by default.
- [ ] The Electron-local backend remains local-only when LAN access is OFF.
- [ ] LAN access can be started and stopped without restarting Inventory Atlas.
- [ ] Stopping LAN access does not stop the desktop application.
- [ ] LAN clients and Electron use the same backend/application state and SQLite database.
- [ ] No second inventory backend/database is created for mobile clients.
- [ ] A suitable private IPv4 interface is selected automatically.
- [ ] The user can select another viable interface when multiple interfaces exist.
- [ ] VPN/virtual interfaces are not silently preferred over normal LAN interfaces.
- [ ] Port conflicts are handled without crashing.
- [ ] The current IP, port, and connection URL are shown.
- [ ] The connection address can be copied.
- [ ] A working QR pairing flow is available.
- [ ] Manual short-code pairing is available.
- [ ] Pairing tokens are cryptographically random and short-lived/one-time.
- [ ] LAN application/API access is rejected before pairing.
- [ ] Paired browsers receive a persistent trusted session.
- [ ] Paired devices can be listed and revoked.
- [ ] Revoke-all works.
- [ ] LAN control cannot be triggered by an unauthenticated remote client.
- [ ] Electron security defaults remain intact.
- [ ] Remote browser clients do not receive privileged Electron APIs.
- [ ] Network/IP changes update the state or produce an actionable error.
- [ ] Electron exit cleanly stops the LAN listener.
- [ ] LAN startup failure never prevents local desktop startup.
- [ ] Windows Firewall troubleshooting is documented.
- [ ] HTTP secure-context limitations are documented.
- [ ] Existing Docker/Proxmox behavior is not changed.
- [ ] Automated tests cover network selection, ports, pairing, access control, and lifecycle.
- [ ] The feature works in both Windows Setup and Portable builds.

---

# Result

After this task, the Windows build can act as a safe personal Inventory Atlas host for devices on the same local network:

```text
Windows PC
  └── Inventory Atlas Lite
        ├── Electron desktop client
        ├── one Express application
        ├── one SQLite database
        └── opt-in authenticated LAN access
              ├── iPhone
              ├── Android
              ├── tablet
              └── another computer
```

The user can inventory items around the house from a phone while the data remains stored and managed by the Windows Inventory Atlas Lite instance.
