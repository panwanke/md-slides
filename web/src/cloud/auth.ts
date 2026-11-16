import { cloud, normalizeUser, type CloudUser } from './client';

type AuthApi = {
  getSession(): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  getUser(): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  signOut(): Promise<{ error?: { message?: string } | null }>;
  sendOtp(input: { email?: string; phone?: string }): Promise<{
    data?: { verificationId?: string; isExistingUser?: boolean };
    error?: { message?: string } | null;
  }>;
  verifyOtp(input: {
    email?: string;
    phone?: string;
    verificationId: string;
    isExistingUser: boolean;
    token: string;
  }): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  signInWithOAuth(input: { provider: 'wechat' | 'workbuddy'; redirectTo: string }): Promise<{
    data?: { url?: string };
    error?: { message?: string } | null;
  }>;
  handleWechatWebCallback?: () => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  handleWorkBuddyCallback?: () => Promise<{ data?: unknown; error?: { message?: string } | null }>;
};

const auth = cloud.auth as unknown as AuthApi;

export interface AuthResult {
  user: CloudUser | null;
  error?: string;
}

interface PendingOtp {
  recipient: string;
  verificationId: string;
  isExistingUser: boolean;
}

let pendingEmail: PendingOtp | null = null;
let pendingPhone: PendingOtp | null = null;

function errMessage(error: { message?: string } | null | undefined, fallback: string): string {
  return error?.message || fallback;
}

function sessionUser(data: unknown): CloudUser | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as { user?: unknown; session?: { user?: unknown } };
  return normalizeUser(value.user ?? value.session?.user ?? value) as CloudUser | null;
}

/** Get current user, refreshing the session when needed. */
export async function currentUser(): Promise<CloudUser | null> {
  const { data, error } = await auth.getSession();
  if (error) return null;
  return sessionUser(data);
}

/** Handle a WeChat / WorkBuddy OAuth callback before the route guard. */
export async function restoreAuthFromCallback(): Promise<AuthResult> {
  const url = new URL(location.href);
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
    return { user: await currentUser() };
  }
  const provider = url.searchParams.get('provider');
  if (provider !== 'wechat' && provider !== 'workbuddy') {
    return { user: null, error: '授权回调缺少有效的登录方式，请重新登录。' };
  }
  const handler = provider === 'wechat' ? auth.handleWechatWebCallback : auth.handleWorkBuddyCallback;
  if (typeof handler !== 'function') {
    return { user: null, error: '当前 SDK 不支持该登录方式，请更新应用后重试。' };
  }
  const { data, error } = await handler.call(auth);
  if (error) return { user: null, error: errMessage(error, '登录失败，请重试。') };
  const user = sessionUser(data);
  if (!user) return { user: null };
  for (const key of ['code', 'state', 'provider']) url.searchParams.delete(key);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return { user };
}

export async function startWechatLogin(): Promise<AuthResult> {
  const back = new URL(location.href);
  back.pathname = '/';
  for (const key of ['code', 'state', 'provider']) back.searchParams.delete(key);
  const { data, error } = await auth.signInWithOAuth({ provider: 'wechat', redirectTo: back.toString() });
  if (error) return { user: null, error: errMessage(error, '无法发起微信登录') };
  if (!data?.url) return { user: null, error: '微信登录地址不可用' };
  location.assign(data.url);
  return { user: null };
}

export async function sendEmailCode(email: string): Promise<AuthResult> {
  const sent = await auth.sendOtp({ email });
  if (sent.error) return { user: null, error: errMessage(sent.error, '验证码发送失败') };
  pendingEmail = {
    recipient: email,
    verificationId: sent.data?.verificationId || '',
    isExistingUser: Boolean(sent.data?.isExistingUser),
  };
  return { user: null };
}

export async function submitEmailCode(email: string, token: string): Promise<AuthResult> {
  const pending = pendingEmail;
  if (!pending || pending.recipient !== email) {
    return { user: null, error: '请先获取当前邮箱的验证码' };
  }
  const result = await auth.verifyOtp({
    email: pending.recipient,
    verificationId: pending.verificationId,
    isExistingUser: pending.isExistingUser,
    token,
  });
  if (result.error) return { user: null, error: errMessage(result.error, '验证码错误') };
  pendingEmail = null;
  return { user: await currentUser() };
}

export async function sendPhoneCode(phone: string): Promise<AuthResult> {
  if (!/^1\d{10}$/.test(phone)) {
    return { user: null, error: '请输入正确的 11 位手机号' };
  }
  const sent = await auth.sendOtp({ phone });
  if (sent.error) return { user: null, error: errMessage(sent.error, '验证码发送失败') };
  pendingPhone = {
    recipient: phone,
    verificationId: sent.data?.verificationId || '',
    isExistingUser: Boolean(sent.data?.isExistingUser),
  };
  return { user: null };
}

export async function submitPhoneCode(phone: string, token: string): Promise<AuthResult> {
  const pending = pendingPhone;
  if (!pending || pending.recipient !== phone) {
    return { user: null, error: '请先获取当前手机号的验证码' };
  }
  const result = await auth.verifyOtp({
    phone: pending.recipient,
    verificationId: pending.verificationId,
    isExistingUser: pending.isExistingUser,
    token,
  });
  if (result.error) return { user: null, error: errMessage(result.error, '验证码错误') };
  pendingPhone = null;
  return { user: await currentUser() };
}

export async function signOutCloud(): Promise<void> {
  pendingEmail = null;
  pendingPhone = null;
  await auth.signOut();
}
