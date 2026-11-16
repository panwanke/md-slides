import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import { publicConfig } from './publicConfig';

/** Single shared client for Auth, Database and Storage. */
export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
});

export interface CloudUser {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  createdAt?: string;
}

interface RawUser {
  id?: string;
  sub?: string;
  uid?: string;
  email?: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  created_at?: string;
}

interface RawSession {
  user?: RawUser | null;
  session?: { user?: RawUser | null } | null;
}

/** Normalize SDK session or user objects into the shape the existing UI expects. */
export function normalizeUser(value: RawSession | RawUser | null | undefined): CloudUser | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as RawSession & RawUser;
  const raw = candidate.id || candidate.sub || candidate.uid
    ? candidate
    : candidate.user ?? candidate.session?.user;
  const id = raw?.id || raw?.sub || raw?.uid;
  if (!id) return null;
  return {
    id,
    email: raw.email || undefined,
    name: raw.name || raw.display_name || undefined,
    displayName: raw.display_name || raw.name || undefined,
    createdAt: raw.created_at || undefined,
  };
}
