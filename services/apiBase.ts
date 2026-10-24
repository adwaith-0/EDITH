const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, '')
  : process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';

export const REALTIME_ENABLED = process.env.NEXT_PUBLIC_REALTIME_ENABLED?.trim().toLowerCase() !== 'false';
