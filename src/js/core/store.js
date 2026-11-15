/**
 * Application state — a small framework-free store.
 *
 * Rules it enforces (FR-08):
 *  • an empty search never reaches the API;
 *  • a newer search aborts the older one, and a late response from a superseded request is ignored,
 *    so stale data can never overwrite fresher results;
 *  • a failed request keeps the last valid weather on screen — it never replaces it with nothing.
 *
 * A search is either plain text ("Delhi") or a place picked from the suggestions. Retry repeats the
 * request exactly as it was made, so a failed pick is retried as the same place.
 */
import { describeError, ErrorType, WeatherApiError } from '../api/errors.js';
import { toApiQuery } from './cities.js';

export const Status = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
});

const INITIAL_STATE = Object.freeze({
  status: Status.IDLE,
  pendingQuery: null, // the city currently being fetched
  weather: null, // last VALID result: { query, place, data, rawText, fetchedAt }
  error: null, // last request failure (cleared when the next request starts)
  validationError: null, // empty-input message (never triggers a request)
});

function toErrorState(error, request) {
  const known = error instanceof WeatherApiError;
  const type = known ? error.type : ErrorType.UNEXPECTED;
  const offline = known && error.offline === true;
  return {
    type,
    query: request.text,
    request,
    status: known ? error.status : null,
    apiCode: known ? error.apiCode : null,
    ...describeError(type, { query: request.text, offline }),
  };
}

export function createWeatherStore({ client, now = Date.now, resolveQuery = toApiQuery }) {
  let state = INITIAL_STATE;
  let latestRequestId = 0;
  let inFlight = null;
  let lastRequest = null;
  const listeners = new Set();

  function update(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of [...listeners]) listener(state);
  }

  function fetchWeather(request, signal) {
    // `text` stays what the user asked for (chip highlight, messages); the API gets the resolved query.
    return request.place
      ? client.getCurrentForPlace(request.place, { signal })
      : client.getCurrent(resolveQuery(request.text), { signal });
  }

  /**
   * Fetch weather for `rawQuery`, or for `place` when it was picked from the suggestions.
   * Resolves with the state once this request has settled.
   */
  async function search(rawQuery, { place = null } = {}) {
    const text = String(rawQuery ?? '').trim();

    if (!text) {
      update({ validationError: { type: ErrorType.VALIDATION, ...describeError(ErrorType.VALIDATION) } });
      return state;
    }

    if (inFlight) inFlight.abort(); // a newer search supersedes the older one
    const requestId = ++latestRequestId;
    const controller = new AbortController();
    inFlight = controller;
    const request = Object.freeze({ text, place });
    lastRequest = request;

    update({ status: Status.LOADING, pendingQuery: text, error: null, validationError: null });

    try {
      const { data, rawText } = await fetchWeather(request, controller.signal);
      if (requestId !== latestRequestId) return state; // outdated response — ignore
      update({
        status: Status.SUCCESS,
        pendingQuery: null,
        error: null,
        weather: Object.freeze({ query: text, place: request.place, data, rawText, fetchedAt: now() }),
      });
    } catch (error) {
      if (requestId !== latestRequestId) return state; // outdated failure — ignore
      update({ status: Status.ERROR, pendingQuery: null, error: toErrorState(error, request) });
    } finally {
      if (inFlight === controller) inFlight = null;
    }
    return state;
  }

  /** Re-run the request that failed (or the most recent one), exactly as it was made. */
  function retry() {
    const request = (state.error && state.error.request) || lastRequest;
    return request ? search(request.text, { place: request.place }) : Promise.resolve(state);
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  return { getState: () => state, subscribe, search, retry };
}
