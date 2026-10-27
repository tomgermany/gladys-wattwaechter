# WattWächter Plus

A [Gladys Assistant](https://gladysassistant.com/) integration that reads your electricity meter
through a **WattWächter Plus**. Everything stays on your local network: no cloud, no account.

## Requirement: switch Modbus on

**The Modbus server is switched OFF by default in the WattWächter and has to be enabled first.**
Without that step the device does not answer on port 502 and the integration can read nothing.

Open the WattWächter's web interface, use the **API explorer**, pick the endpoint
`POST /api/v1/settings` and send this body:

```json
{ "modbus": { "enable": true, "port": 502 } }
```

Only change the port if it is already taken. Whatever port you set goes into the integration's
configuration afterwards.

## Installation

1. In Gladys, open **Integrations** and install the **WattWächter Plus**.
2. Open its **Configuration** screen.
3. Enter the device address: its IP, for example `192.168.0.6`, or the mDNS name
   `wattwaechter-xxxxxxxxxxxx.local`.
4. Enter the Modbus port, 502 by default.
5. Enter the **REST API read token** for the period totals in the widget. Without a token everything
   works except the four period buttons.
6. Press **Test the connection**. The answer names the model, the firmware, the number of readings and
   the current power.
7. Run a scan in the **Discovery** tab and create the device it finds.

## What the device provides

All of it is read-only: a meter measures, it has no commands.

| Feature | Meaning |
| --- | --- |
| Power | The current consumption in watts. **Positive is consumption, negative is feed-in.** |
| Consumption total | The cumulative meter reading in kWh, for the energy monitoring. |
| Feed-in total | The cumulative feed-in reading in kWh. |
| Power L1 to L3 | The power per phase. |
| Voltage L1 to L3 | The voltage per phase, in volts. |
| Current L1 to L3 | The current per phase, in amperes. |
| Frequency | The grid frequency, in hertz. |

A reading the meter does not provide gets no feature at all. A meter that knows only two phases
therefore has no L3, rather than a zero that would be wrong.

## The widget “Electricity meter”

- **The power** as a big tile, carrying the meter's own sign. On feed-in the tile turns green.
- **The meter number**, so it is clear which meter this is.
- **Four buttons:** today, 7 days, 30 days, 365 days. They can be hidden in the widget settings. The selected period is highlighted and its
  consumption appears below, in kWh.

In the tile's settings you can also choose which meter feeds it and whether the period totals appear
in kWh or Wh.

## Scenes

**The trigger “Power crossed a limit”** fires when the power rises above the upper limit or drops
below the lower one. The limits live in the configuration; 0 disables that side. The lower limit may
be negative, because feed-in is negative power.

The trigger fires **once per crossing**, not on every reading. The power has to move away from the
limit again before it can fire anew. For a plain “power above X” condition, Gladys' own **device state
changed** trigger on the power feature is enough.

**The action “Read the meter readings”** reads the device now and hands power, consumption, feed-in
and the meter number to the following steps.

**The action “Read a period total”** sums the consumption over a period and returns it. Needs the read
token.

## How it works

Two routes to the same device, and both are needed:

- **Modbus TCP** provides the readings. It answers only the read function codes `0x03` and `0x04`, and
  it knows only the present. The device allows at most two clients at a time.
- **The REST API** provides the periods, because only it knows what was consumed yesterday. It needs
  the read token and runs on port 80.

The integration reads the registers according to the **SunSpec** standard. From firmware 1.2.1 on,
values are also available as floats, and that route is used when it answers; otherwise the integers
are scaled in the integration. The value SunSpec reserves for “this meter does not provide that” is
filtered out and never published.

## Legal notice

This is an **independent, unofficial project**. It is **not affiliated with SmartCircuits GmbH** or
with WattWächter, and is neither authorised nor supported or sponsored by them. **WattWächter** is a
trademark of its respective owner and is used here only to name the device this integration works
with. All other trademarks, product and company names belong to their respective owners.
