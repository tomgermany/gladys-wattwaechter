# Changelog

All notable changes to this integration are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.1] - 2026-10-24
## [1.3.0] - 2026-10-23
### Fixed

- **The connection is no longer opened twice at startup.** `connected` and `onConfigUpdated` both run
  the connect path, and on a restart both fire within seconds of each other. A real log showed
  `Meter ready` twice, seven seconds apart, and the device reported two active connections
  afterwards. A build that is already running is now remembered, and a second caller waits for it.
- **A connect gives the previous connection back before opening a new one.** Destroying the socket
  returns immediately while the device only frees the slot once the FIN arrives, so a connect landing
  in that gap found both slots taken and timed out. The connect path now waits for the socket to be
  down. `close()` also returns when the socket is already gone, instead of waiting for an event that
  will never come.
- **The connection test no longer costs a second connection.** It does not connect itself; it reads
  the configuration, and that round trip lets Gladys deliver `onConfigUpdated`, which connects. The
  working connection was then rebuilt for nothing. Connecting is now idempotent: a connection that is
  open and points at the same device is kept, and only the readings are taken again. A dropped socket
  and a changed address still rebuild, because those really are failures.

### Added

- **The meter index is shown beside the live power.** The card showed the power and the period totals
  but never the running total from register 40116 (OBIS 1.8.0) — the figure that also appears on the
  bill. The tile is bound to the `consumption` feature, so it follows the published values by itself.
- **A `build` workflow can be started by hand.** It builds the image of a chosen branch and tags it
  after that branch, e.g. `:fix-netz`, so a test image can be installed without publishing a version.
  The `latest` tag is gone: a build of an unreleased branch must never be offered to users as an
  update.

### Changed

- **The meter index is labelled in all four languages.** The widget asked for a text that did not
  exist yet, and an unknown text falls back to its own key — the card would have shown the bare word
  "index". It reads "Zählerstand" now, and the other three languages with it.

## [1.2.6] - 2026-10-23

### Fixed

- The `ci` workflow runs `npm install` instead of `npm ci`. `npm ci` refuses to run when the lockfile
  and `package.json` disagree by a byte, and that refusal produced red runs whose cause was a checksum
  rather than a fault in the integration.
- Lint errors that failed the build: an error re-thrown without its `cause`, and an import that was no
  longer used.

### Changed

- The `package-lock.json` file is no longer kept in the repository. Nothing reads it — the image and
  CI both resolve from `package.json` — and every hand-edit of it produced a new failure.
- Three test files that belonged to the integration template rather than to this integration were
  removed; they imported modules that do not exist here.

## [1.1.0] - 2026-10-22

### Fixed

- **The dashboard widget no longer says "not implemented".** A widget is drawn by Gladys from the
  content the integration answers with, and no handler had been registered for the widget key, so
  Gladys got the SDK's default answer to an unhandled message. `onWidgetGet` and `onWidgetAction` are
  now registered under the manifest's widget key.
- **The frequency feature no longer makes the whole device unacceptable.** It had been filed under
  `frequency-sensor`, a category Gladys does not have. An unknown category is a refusal for the entire
  device — the scan logged twelve healthy features and still nothing appeared in the Discovery tab.
  Every feature now belongs to `energy-sensor`.
- **The external ids are built the way Gladys checks them.** A type segment was passed where Gladys
  expects a platform id, so the device was refused with
  `must start with "ext:ext-dev-wattwachter-plus:"`. The type segment is now empty.
- **A second Modbus connection no longer blocks the connection test.** The device accepts at most two
  simultaneous clients. The connection test opened its own client next to the running poll, so it
  asked for a third and timed out after five seconds. Every read now runs on the one connection this
  process owns.
- **The shutdown path closes the right object.** It called a field of a connection structure that no
  longer exists, so closing did nothing and the device kept the socket.

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

## [1.0.0] - 2026-10-22

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
