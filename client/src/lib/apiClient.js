import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function getAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

export async function apiRequest(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || payload?.error || `Request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload?.data ?? payload;
}

export const api = {
  getImportedTournamentSources: () => apiRequest('/api/imports/sources'),
  getImportedTournamentDetails: (sourceId) => apiRequest(`/api/imports/sources/${sourceId}`),
  fetchParticipants: (mainLink) =>
    apiRequest('/api/imports/participants', {
      method: 'POST',
      body: JSON.stringify({ mainLink })
    }),
  previewImport: ({ mainLink, topCutLink, mainParticipantId }) =>
    apiRequest('/api/imports/preview', {
      method: 'POST',
      body: JSON.stringify({
        mainLink,
        topCutLink: topCutLink || null,
        mainParticipantId
      })
    }),
  confirmImport: ({ mainLink, topCutLink, mainParticipantId, deckNotes }) =>
    apiRequest('/api/imports/confirm', {
      method: 'POST',
      body: JSON.stringify({
        mainLink,
        topCutLink: topCutLink || null,
        mainParticipantId,
        deck: deckNotes ? { notes: deckNotes } : {}
      })
    }),
  getLeaderboard: () => apiRequest('/api/leaderboard'),
  getMonthlyLeaderboard: () => apiRequest('/api/leaderboard/monthly'),
  getFilteredLeaderboard: ({ year, month } = {}) => {
    const params = new globalThis.URLSearchParams();

    if (year) params.set('year', year);
    if (month) params.set('month', month);

    const query = params.toString();
    return apiRequest(`/api/leaderboard/filtered${query ? `?${query}` : ''}`);
  },
  getPlayerStats: (userId) => apiRequest(`/api/leaderboard/players/${userId}/stats`),
  getPlayerHistory: (userId) => apiRequest(`/api/leaderboard/players/${userId}/history`),
  getPlayerHistoryDetails: (userId, recordId) =>
    apiRequest(`/api/leaderboard/players/${userId}/history/${recordId}`),
  getPendingRecords: () => apiRequest('/api/admin/pending-records'),
  getReviewFlags: () => apiRequest('/api/admin/review-flags'),
  decideRecord: (recordId, status) =>
    apiRequest(`/api/admin/records/${recordId}/decision`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    })
};
