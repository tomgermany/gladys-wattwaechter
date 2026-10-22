# Changelog

All notable changes to this integration are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The dashboard widget no longer says "not implemented".** A widget is drawn by Gladys from the
  content the integration answers with, and no handler had been registered for the widget key, so
  Gladys got the SDK's default answer to an unhandled message. `onWidgetGet` and `onWidgetAction` are
  now registered under the manifest's widget key.
- **The frequency feature no longer makes the whole device unacceptable.** It had been filed under
  `frequency-sensor`, a category Gladys does not have. An unknown category is a refusal for the entire
  device — the scan logged twelve healthy features and still nothing appeared in the Discovery tab.
  Every feature now belongs to `energy-sensor`.
- **The external ids are built the way Gladys checks them.** The type segment I passed put a type
  where Gladys expects a platform id, so the device was refused with
  `must start with "ext:ext-dev-wattwachter-plus:"`. The type segment is now empty.
- **A second Modbus connection no longer blocks the connection test.** The device accepts at most two
  simultaneous clients and holds an idle connection for five minutes. The connection test opened its
  own client next to the running poll, so it asked for a third and timed out after five seconds. Every
  read now runs on the one connection this process owns, with a single retry on a fresh socket for the
  case where a recreated container leaves the previous connection alive on the device.
- **The shutdown path closes the right object.** It called a field of a connection structure that no
  longer exists, so closing did nothing and the device kept the socket until its idle timeout.

### Changed

- **The device ID is labelled as a device ID, not as a meter number.** The SunSpec Common Block's SN
  field holds the MAC address — the manufacturer's register table says so — and it was being shown as
  "meter number". The value was always right, the name was wrong. Corrected in the widget, the scene
  output, the manifest and the documentation.
- **The documentation no longer promises a feed-in total unconditionally.** Whether a feature appears
  depends on the electricity meter, not on the WattWächter; a meter without feed-in gets no feed-in
  total.
- `docs/en.md` and `docs/fr.md` added: both are mandatory for the catalog, `docs/de.md` was the only
  user documentation present.

## [1.0.0]

### Added

- One Gladys device with the meter readings: power, the consumption index, power, voltage and current
  per phase, and the grid frequency. All read-only.
- A dashboard widget: the current power as a large tile carrying the meter's own sign, the device ID,
  and four buttons for the day, week, month and year totals.
- A scene trigger `power_threshold_crossed` that fires once per crossing, with a hysteresis band.
- Two scene actions: read the meter, and read a period total.
- A `test_connection` configuration action that names the one thing that is not obvious about this
  device: the Modbus server is off by default.
- Modbus TCP client reading the SunSpec model 1, 203 and 213 registers, preferring the float model
  when the firmware provides it.
- REST client for the historical period totals.
