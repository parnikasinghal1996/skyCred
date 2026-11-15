/**
 * Application state — a small framework-free store.
 *
 * Rules it enforces (FR-08):
 *  • an empty search never reaches the API;
 *  • a newer search aborts the older one, and a late response from a superseded request is ignored,
 *    so stale data can never overwrite fresher results;
 *  • a failed request keeps the last valid weather on screen — it never replaces it with nothing.
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
  weather: null, // last VALID result: { query, data, rawText, fetchedAt }
  error: null, // last request failure (cleared when the next request starts)
  validationError: null, // empty-input message (never triggers a request)
});

function toErrorState(error, query) {
  const known = error instanceof WeatherApiError;
  const type = known ? error.type : ErrorType.UNEXPECTED;
  const offline = known && error.offline === true;
  return {
    type,
    query,
    status: known ? error.status : null,
    apiCode: known ? error.apiCode : null,
    ...describeError(type, { query, offline }),
  };
}

export function createWeatherStore({ client, now = Date.now, resolveQuery = toApiQuery }) {
  let state = INITIAL_STATE;
  let latestRequestId = 0;
  let inFlight = null;
  let lastQuery = null;
  const listeners = new Set();

  function update(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of [...listeners]) listener(state);
  }

  /** Fetch weather for `rawQuery`. Resolves with the state once this request has settled. */
  async function search(rawQuery) {
    const query = String(rawQuery ?? '').trim();

    if (!query) {
      update({ validationError: { type: ErrorType.VALIDATION, ...describeError(ErrorType.VALIDATION) } });
      return state;
    }

    if (inFlight) inFlight.abort(); // a newer search supersedes the older one
    const requestId = ++latestRequestId;
    const controller = new AbortController();
    inFlight = controller;
    lastQuery = query;

    update({ status: Status.LOADING, pendingQuery: query, error: null, validationError: null });

    try {
      // `query` stays what the user asked for (chip highlight, messages); the API gets the resolved `q`.
      const { data, rawText } = await client.getCurrent(resolveQuery(query), { signal: controller.signal });
      if (requestId !== latestRequestId) return state; // outdated response — ignore
      update({
        status: Status.SUCCESS,
        pendingQuery: null,
        error: null,
        weather: Object.freeze({ query, data, rawText, fetchedAt: now() }),
      });
    } catch (error) {
      if (requestId !== latestRequestId) return state; // outdated failure — ignore
      update({ status: Status.ERROR, pendingQuery: null, error: toErrorState(error, query) });
    } finally {
      if (inFlight === controller) inFlight = null;
    }
    return state;
  }

  /** Re-run the request that failed (or the most recent one). */
  function retry() {
    const query = (state.error && state.error.query) || lastQuery;
    return query ? search(query) : Promise.resolve(state);
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  return { getState: () => state, subscribe, search, retry };
}
