// Deep links into external apps — all free, no API keys.

import type { DeepLinkAction } from './types';

const enc = encodeURIComponent;

export function actionUrl(action: DeepLinkAction): string {
  switch (action.type) {
    case 'youtube':
      // With a resolved video ID the watch page starts playing immediately;
      // otherwise fall back to search results.
      return action.videoId
        ? `https://www.youtube.com/watch?v=${action.videoId}`
        : `https://www.youtube.com/results?search_query=${enc(action.query)}`;
    case 'spotify':
      return `https://open.spotify.com/search/${enc(action.query)}`;
    case 'maps':
      return `https://www.google.com/maps/search/?api=1&query=${enc(action.query)}`;
    case 'directions':
      return `https://www.google.com/maps/dir/?api=1&destination=${enc(action.query)}`;
    case 'search':
      return `https://www.google.com/search?q=${enc(action.query)}`;
    case 'wikipedia':
      return `https://en.wikipedia.org/wiki/Special:Search?search=${enc(action.query)}`;
    case 'mail': {
      const params = [
        action.subject && `subject=${enc(action.subject)}`,
        action.body && `body=${enc(action.body)}`,
      ].filter(Boolean);
      return `mailto:${action.to ?? ''}${params.length ? `?${params.join('&')}` : ''}`;
    }
    case 'whatsapp':
      return `https://wa.me/${(action.to ?? '').replace(/\D/g, '')}?text=${enc(action.body)}`;
    case 'sms':
      // "?&body=" is the form both iOS and Android accept.
      return `sms:${action.to ?? ''}${action.body ? `?&body=${enc(action.body)}` : ''}`;
    case 'call':
      return `tel:${action.to}`;
  }
}

export function actionLabel(action: DeepLinkAction): string {
  switch (action.type) {
    case 'youtube':
      return 'Play on YouTube';
    case 'spotify':
      return 'Play on Spotify';
    case 'maps':
      return 'Open in Maps';
    case 'directions':
      return 'Get directions';
    case 'search':
      return 'Search the web';
    case 'wikipedia':
      return 'Read on Wikipedia';
    case 'mail':
      return 'Open in your mail app';
    case 'whatsapp':
      return 'Send on WhatsApp';
    case 'sms':
      return 'Send a text';
    case 'call':
      return `Call ${action.to}`;
  }
}

export function actionDetail(action: DeepLinkAction): string {
  switch (action.type) {
    case 'mail':
      return action.subject ?? action.to ?? 'New email';
    case 'whatsapp':
    case 'sms':
      return action.body ?? action.to ?? '';
    case 'call':
      return action.to;
    default:
      return action.query;
  }
}

/** Web links open in a new tab; mailto:/tel:/sms: hand off to the OS without leaving the page. */
export const isWebLink = (url: string): boolean => url.startsWith('http');
