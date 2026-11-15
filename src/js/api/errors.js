/**
 * Error model for the WeatherAPI client (PRD FR-08).
 *
 * Every failure the UI can show maps to exactly one ErrorType, and `describeError` owns the
 * user-facing wording so the copy lives in one place.
 */

export const ErrorType = Object.freeze({
  VALIDATION: 'validation', // empty city input
  CITY_NOT_FOUND: 'city_not_found', // WeatherAPI 1006
  API_CONFIG: 'api_config', // missing / invalid / disabled API key
  RATE_LIMIT: 'rate_limit', // quota exceeded or HTTP 429
  NETWORK: 'network', // fetch itself failed (offline, DNS, blocked)
  SERVICE_UNAVAILABLE: 'service_unavailable', // HTTP 5xx
  TIMEOUT: 'timeout', // no answer within REQUEST_TIMEOUT_MS
  UNEXPECTED: 'unexpected', // non-JSON body, wrong shape, anything else
});

export class WeatherApiError extends Error {
  constructor(type, { status = null, apiCode = null, apiMessage = null, offline = false, cause } = {}) {
    super(apiMessage || type);
    this.name = 'WeatherApiError';
    this.type = type;
    this.status = status;
    this.apiCode = apiCode;
    this.apiMessage = apiMessage;
    this.offline = offline;
    if (cause !== undefined) this.cause = cause;
  }
}

/** WeatherAPI's own error codes → our error types (https://www.weatherapi.com/docs/#intro-error-codes). */
const API_CODE_TYPES = new Map([
  [1002, ErrorType.API_CONFIG], // API key not provided
  [1003, ErrorType.VALIDATION], // parameter 'q' not provided
  [1005, ErrorType.UNEXPECTED], // API request url is invalid
  [1006, ErrorType.CITY_NOT_FOUND], // no matching location found
  [2006, ErrorType.API_CONFIG], // API key provided is invalid
  [2007, ErrorType.RATE_LIMIT], // API key has exceeded calls per month quota
  [2008, ErrorType.API_CONFIG], // API key has been disabled
  [2009, ErrorType.API_CONFIG], // API key has no access to the resource
  [9000, ErrorType.UNEXPECTED], // JSON body passed is invalid
  [9001, ErrorType.UNEXPECTED], // JSON body contains too many locations
  [9999, ErrorType.SERVICE_UNAVAILABLE], // internal application error
]);

/** Classify a non-2xx response. The API's own error code wins; the HTTP status is the fallback. */
export function classifyFailure(status, apiCode) {
  if (API_CODE_TYPES.has(apiCode)) return API_CODE_TYPES.get(apiCode);
  if (status === 429) return ErrorType.RATE_LIMIT;
  if (status === 401 || status === 403) return ErrorType.API_CONFIG;
  if (status >= 500 && status <= 599) return ErrorType.SERVICE_UNAVAILABLE;
  return ErrorType.UNEXPECTED;
}

/** User-facing copy for each error type, plus whether a Retry button makes sense. */
export function describeError(type, { query = '', offline = false } = {}) {
  switch (type) {
    case ErrorType.VALIDATION:
      return {
        title: 'City name required',
        message: 'Please enter a city name to search.',
        retryable: false,
      };
    case ErrorType.CITY_NOT_FOUND:
      return {
        title: 'City not found',
        message: query
          ? `We couldn't find “${query}”. Check the spelling or try another city.`
          : 'Check the spelling or try another city.',
        retryable: false,
      };
    case ErrorType.API_CONFIG:
      return {
        title: 'API configuration error',
        message:
          'The weather service rejected this app’s API key. The key is missing, invalid or disabled — check the API key configuration.',
        retryable: false,
      };
    case ErrorType.RATE_LIMIT:
      return {
        title: 'Temporary service error',
        message: 'The weather service is handling too many requests right now. Please wait a moment and try again.',
        retryable: true,
      };
    case ErrorType.NETWORK:
      return {
        title: 'Network connection problem',
        message: offline
          ? 'You appear to be offline. Check your internet connection and try again.'
          : 'We couldn’t reach the weather service. Check your internet connection and try again.',
        retryable: true,
      };
    case ErrorType.SERVICE_UNAVAILABLE:
      return {
        title: 'Service unavailable',
        message: 'The weather service is currently unavailable. Please try again shortly.',
        retryable: true,
      };
    case ErrorType.TIMEOUT:
      return {
        title: 'Request timed out',
        message: 'The weather service took too long to respond. Please try again.',
        retryable: true,
      };
    default:
      return {
        title: 'Something went wrong',
        message: 'We received an unexpected response from the weather service. Please try again.',
        retryable: true,
      };
  }
}
