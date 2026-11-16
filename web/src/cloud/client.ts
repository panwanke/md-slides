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

interface RawSession {
  user?: {
    id?: string;
    sub?: string;
    email?: string;
    name?: string;
    display_name?: string;
    created_at?: string;
  } | null;
}

/** Normalize SDK session users into the shape the existing UI expects. */
export function normalizeUser(session: RawSession | null | undefined): CloudUser | null {
  const raw = session?.user;
  const id = raw?.id || raw?.sub;
  if (!id) return null;
  return {
    id,
    email: raw.email || undefined,
    name: raw.name || raw.display_name || undefined,
    displayName: raw.display_name || raw.name || undefined,
    createdAt: raw.created_at || undefined,
  };
}
