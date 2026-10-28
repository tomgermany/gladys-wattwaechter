# WattWächter Plus for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com/) external integration that reads your electricity
meter through a **WattWächter Plus**, over your local network. No cloud, no account.

**[Anwenderdokumentation auf Deutsch](docs/de.md)** · [Englisch](docs/en.md) ·
[Französisch](docs/fr.md) · [Spanisch](docs/es.md)

![Integration](cover.png)

## Before you start: switch Modbus on

**The Modbus server is switched OFF by default in the WattWächter and has to be enabled first.**
Without that step the device does not answer on port 502 and the integration can read nothing.

Open the WattWächter's web interface, use the **API explorer**, pick `POST /api/v1/settings` and send:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

## What it brings

- **One device** with the meter readings and the two cumulative meter totals. All read-only: a meter
  measures, it has no commands.
- **A dashboard widget** with the current power as a big tile (positive is consumption, negative is
  feed-in), the meter number, and four buttons for the day, week, month and year totals.
- **A scene trigger** that fires when the power crosses a limit you set. It fires once per crossing,
  with a hysteresis band so a meter sitting on the limit does not flap.
- **Two scene actions:** read the meter now, or read a period total.
- **A configuration button** that says what the device answered, firmware included.

## Requirements

- Gladys Assistant **5.1.0 or later**.
- The Modbus server enabled in the device, see above.
- The device and the Gladys host on the same network.

## Configuration

| Setting | Meaning |
| --- | --- |
| Address | IP or mDNS name of the device, e.g. `192.168.0.6`. |
| Modbus port | 502 unless you changed it in the device. |
| Read token | The REST API read token, only needed for the period buttons. |
| Refresh interval | How often the meter is read, 60 seconds minimum. |
| Power limits | The two thresholds of the scene trigger. 0 disables a side. |

## How it works

Two routes to the same device, and both are needed:

- **Modbus TCP (port 502)** carries the readings. It answers only the read function codes `0x03` and
  `0x04`, so there is no way to write anything, and it knows only the present. The device allows at
  most two clients at a time.
- **The REST API (port 80)** carries the periods, because only it knows what was consumed yesterday.
  It needs the read token.

The registers follow the **SunSpec** standard. The device implements model 1 (identity), 203
(readings as scaled integers) and, from firmware 1.2.1, 213 (the same readings as floats). The
integration probes for 213 and prefers it, because there is nothing to compute on that route, and
falls back to 203 so an older device works too. The value SunSpec reserves for "this meter does not
provide that reading" is filtered out and never published.

## Development

```bash
npm install
npm test          # node --test, no device and no Gladys needed
npm run lint
node index.js     # needs the Gladys environment variables
```

The layout, and why each piece is where it is:

| File | Purpose |
| --- | --- |
| `index.js` | Wiring only: registers the handlers before connecting, holds no logic. |
| `src/config.js` | Defaults and normalisation of the user settings. |
| `src/wattwaechter/transport.js` | The raw TCP socket, and the frame assembly. |
| `src/wattwaechter/modbus.js` | The Modbus protocol and the register map. No Gladys dependency: unit-tested offline. |
| `src/wattwaechter/api.js` | The REST client for the history periods. |
| `src/devices/meter.js` | Turns readings into Gladys features. |
| `src/widgets.js` | The dashboard card content. |
| `src/scenes.js` | The two scene actions. |
| `src/wattwaechter/labels.js` | The runtime texts, in four languages. |
| `gladys-assistant-integration.json` | The manifest: name, settings, widget, scene trigger and actions. |
| `docs/` | User documentation in four languages, plus the project overview. |

## What is verified, and what is not

Verified against a **WattWächter Plus on firmware 1.2.1**: the connection, the identity registers, the
readings, the two meter totals, the device in Gladys and the widget with its period buttons.

**Not verified:** the unit tests have been written but the suite has not been run against the real
SDK in this repository, and the register addresses of the SunSpec model 213 layout were derived from
the model 203 addresses rather than read off a device. A register that does not answer is logged and
skipped, so a mistake there shows up as a missing reading rather than a failure.

## Legal notice

This is an **independent, unofficial project**. It is **not affiliated with SmartCircuits GmbH** or
with WattWächter, and is neither authorised nor supported or sponsored by them. **WattWächter** is a
trademark of its respective owner, used here only to name the device this integration works with. All
other trademarks, product and company names belong to their respective owners.

## Licence

Apache-2.0.
