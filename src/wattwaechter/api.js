// -----------------------------------------------------------------------------
// REST API client for the WattWächter Plus.
//
// WHY THIS FILE EXISTS AT ALL
// Modbus gives the live readings, but nothing about the past: it has no notion
// of "yesterday", only of "right now". The day, week, month and year totals the
// widget buttons need therefore come from the device's REST API, which is the
// only place that knows how much was consumed over a period.
//
// WHAT IT TALKS TO
//   GET /api/v1/history/latest              the current reading, the full set
//   GET /api/v1/history/highRes?date=...    15-minute values for one day
//   GET /api/v1/history/lowRes?start=...&days=...
//                                           daily values over a range, with the
//                                           period totals already summed
//
// THE TOKEN IS OPTIONAL, AND HERE IS WHY
// The device has a setting `api_auth_required`. When it is false — the factory
// state, and what the reference device here runs — the history endpoints answer
// with no credentials at all. This client therefore always exists, and sends an
// `Authorization` header only when a token was configured. Treating "no token"
// as "API unusable" would hide the period buttons on a device that does not
// need one.
//
// THE ONE THING WORTH KNOWING ABOUT THE ANSWER
// `lowRes` answers with the daily rows AND with the totals for the whole range
// already computed:
//
//   { "start": "...", "items": [ { "date": "...", "import_kWh": 3.4, ... } ],
//     "import_total_kWh": 44.547, "export_total_kWh": 0.332 }
//
// So there is no summing to do here. An earlier plan had this file adding the
// days up; the device does it, and using its own number avoids two different
// roundings of the same thing.
//
// READ ONLY
// The integration never writes through the API. A WRITE token exists, for
// settings and OTA, and is deliberately not asked for here: nothing in reading a
// meter justifies holding a key that can reconfigure the device.
//
// NOT VERIFIED AGAINST A DEVICE. The shapes below come from the documentation
// and from the answers the device really gave while we planned this. The error
// messages name the endpoint and the beginning of the answer, so a surprise is
// readable in the log rather than mysterious.
// -----------------------------------------------------------------------------

export class ApiError extends Error {}

/** First characters of a raw answer, for the log — never a full body. */
const snippet = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, 120);

/** The periods the widget and the scene action offer, and what they ask for. */
export const PERIODS = {
  day: { source: 'highRes', days: 1 },
  week: { source: 'lowRes', days: 7 },
  month: { source: 'lowRes', days: 30 },
  year: { source: 'lowRes', days: 365 },
};

/** `YYYY-MM-DD` for a date, which is the notation the API expects. */
export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export class WattwaechterApi {
  /**
   * @param {object} options
   * @param {string} options.host IP or mDNS name of the device
   * @param {string} [options.token] READ token; optional, see the note at the top
   * @param {number} [options.timeoutMs]
   * @param {typeof fetch} [options.fetch] injectable for the tests
   */
  constructor({ host, token = '', timeoutMs = 8000, fetch: fetchImpl = globalThis.fetch } = {}) {
    this.host = host;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.base = `http://${host}/api/v1`;
  }

  async get(path, params = {}) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const url = `${this.base}/${path}${query ? `?${query}` : ''}`;

    const headers = { accept: 'application/json' };
    // Only when there is one: a device with `api_auth_required: false` refuses
    // no request, and an empty "Bearer " would be worse than sending nothing.
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    let response;
    try {
      response = await this.fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ApiError(`WattWaechter unreachable (${this.host}): ${err.message}`);
    }
    // The body is read as text first, then parsed: an answer that is not JSON
    // (a login page, an error page) then says what it was instead of failing as
    // a bare "invalid JSON".
    let body;
    try {
      body = await response.text();
    } catch (err) {
      throw new ApiError(`${path}: unreadable answer (${err.message})`);
    }
    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status} for ${path} — ${snippet(body)}`);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new ApiError(`Invalid JSON for ${path} — answer starts with: ${snippet(body)}`);
    }
  }

  /** The current reading, the same set the device's own dashboard shows. */
  async latest() {
    return this.get('history/latest');
  }

  /**
   * The consumption and feed-in totals of a period, in kilowatt-hours.
   *
   * `day` uses `highRes`, which returns the 15-minute values of one day; the
   * day's total is then the last daily row of that answer. The longer periods
   * use `lowRes`, whose `import_total_kWh` and `export_total_kWh` are already
   * the sums over the range.
   */
  async periodTotal(period, now = new Date()) {
    const spec = PERIODS[period];
    if (!spec) throw new ApiError(`Unknown period: ${period}`);

    if (spec.source === 'highRes') {
      const answer = await this.get('history/highRes', { date: isoDate(now) });
      const items = Array.isArray(answer?.items) ? answer.items : [];
      const last = items.at(-1) ?? {};
      return {
        period,
        consumption: last.import_kWh ?? answer?.import_total_kWh ?? null,
        feed_in: last.export_kWh ?? answer?.export_total_kWh ?? null,
      };
    }

    const start = isoDate(new Date(now.getTime() - (spec.days - 1) * 86400000));
    const answer = await this.get('history/lowRes', { start, days: spec.days });
    return {
      period,
      consumption: answer?.import_total_kWh ?? null,
      feed_in: answer?.export_total_kWh ?? null,
    };
  }
}
