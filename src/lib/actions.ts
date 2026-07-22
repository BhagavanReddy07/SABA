// Deep links into external apps — all free, no API keys.

import type { ChatAction } from './types';

export function actionUrl(action: ChatAction): string {
  switch (action.type) {
    case 'youtube':
      // With a resolved video ID the watch page starts playing immediately;
      // otherwise fall back to search results.
      return action.videoId
        ? `https://www.youtube.com/watch?v=${action.videoId}`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`;
    case 'spotify':
      return `https://open.spotify.com/search/${encodeURIComponent(action.query)}`;
    case 'maps':
      return `https://www.google.com/maps/search/${encodeURIComponent(action.query)}`;
    case 'search':
      return `https://www.google.com/search?q=${encodeURIComponent(action.query)}`;
    case 'mail': {
      const params = [
        action.subject && `subject=${encodeURIComponent(action.subject)}`,
        action.body && `body=${encodeURIComponent(action.body)}`,
      ].filter(Boolean);
      return `mailto:${action.to ?? ''}${params.length ? `?${params.join('&')}` : ''}`;
    }
  }
}

export function actionLabel(action: ChatAction): string {
  switch (action.type) {
    case 'youtube':
      return `Play on YouTube`;
    case 'spotify':
      return `Play on Spotify`;
    case 'maps':
      return `Open in Maps`;
    case 'search':
      return `Search the web`;
    case 'mail':
      return `Open in your mail app`;
  }
}
