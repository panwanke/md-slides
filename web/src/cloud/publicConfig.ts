/**
 * WorkBuddy Cloud Service public configuration.
 *
 * Values are the publicConfig returned by the trusted workbuddy_cloud_service
 * tool for application wbapp_Y8YYMDc6ZZ7Nz6ksDsXHuG. They contain no secrets:
 * the server enforces an exact Origin match for the publishable key.
 */
export interface WorkBuddyPublicConfig {
  endpoint: string;
  oauthRelayBaseUrl: string;
  publishableKey: string;
}

export const publicConfig: WorkBuddyPublicConfig = {
  endpoint: 'https://wbapp-y8yymdc6zz7nz6ksdsxhug.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_Y8YYMDc6ZZ7Nz6ksDsXHuG_ikiO7ZU9X3ipFVoCs2FAm9rWoBV4iXkT',
};

/** Distinguish the WorkBuddy cloud deployment from GitHub Pages / local serve. */
export function isCloudRuntime(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_CLOUD === '1') return true;
  const host = location.hostname.toLowerCase();
  return /(^|\.)(workbuddy\.(host|link|cn)|tcloudbaseapp\.com)$/.test(host);
}
