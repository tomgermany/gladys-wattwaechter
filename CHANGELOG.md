# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The electricity meter as one Gladys device: power in total and per phase,
  voltage, current and frequency, plus the two cumulative meter totals
  (consumption and feed-in) as energy features in kWh, so Gladys' energy
  monitoring can use them. Everything is read-only: a meter has no commands.
- The Modbus TCP client, speaking the SunSpec models 1, 203 and 213. Model 213 is
  preferred when the firmware publishes floats; model 203 with its scale factors
  is the fallback. The value SunSpec reserves for "this meter does not provide
  that" is filtered out and never published.
- A raw TCP transport with frame assembly, because Modbus is binary over a
  socket and a stream may split or merge frames.
- The REST API client for the history periods. The low-resolution answer already
  carries the sums over a range, so nothing is added up in the integration.
- The dashboard widget "Electricity meter": the live power as a tile carrying
  the meter's own sign, the meter number, and four buttons for the day, week,
  month and year totals.
- The scene trigger `power_threshold_crossed`, with both limits set in the
  configuration. It fires once per crossing, with a hysteresis band.
- The scene actions `read_meter` and `read_period`.
- The configuration button "Test the connection", which names the model, the
  firmware, the number of readings and the current power.
- User documentation in German, English, French and Spanish, plus the overview
  page explaining which value means what.
- Manifest texts in four languages, German first.
- Unit tests for the Modbus frame parsing, the scaling, the float conversion, the
  sentinel, the configuration and the manifest rules.

### Changed

- Replaced the SDK template's demo integration (weather station, switch, light,
  plug, motion sensor, camera) with the WattWächter Plus.
- The device is addressed by its serial number when the Modbus Common Block
  reports one, so a changed IP address does not create a second device.
- A register or an endpoint that does not answer is logged and skipped, so one
  dead path never takes a whole read down.
- Formatting and indentation are not checked: Prettier is deliberately not used
  in this project.

[Unreleased]: https://github.com/tomgermany/gladys-wattwaechter/compare/v1.0.0...HEAD
