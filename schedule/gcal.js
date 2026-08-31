// gcal.js — Googleカレンダー接続層（ブラウザのみ / サーバ不要）。
// Google Identity Services のトークンクライアントでアクセストークンを取得し、
// Calendar API を fetch で直接叩く。トークンはメモリ上だけに持ち、保存しない。

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/calendar/v3';

export const SCOPE_READ = 'https://www.googleapis.com/auth/calendar.readonly';
export const SCOPE_WRITE = 'https://www.googleapis.com/auth/calendar.events';
/** 日本の祝日カレンダー（公開）。freeBusy に含めると祝日が自動で埋まる。 */
export const JP_HOLIDAY_CALENDAR = 'ja.japanese#holiday@group.v.calendar.google.com';

let gsiReady = null;
let tokenClient = null;
let clientIdInUse = '';
let token = null; // { access_token, scopes:Set, expiresAt }

function loadGsi() {
  if (gsiReady) return gsiReady;
  gsiReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const el = document.createElement('script');
    el.src = GSI_SRC; el.async = true; el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Googleのログイン用スクリプトを読み込めませんでした（ネットワークをご確認ください）'));
    document.head.appendChild(el);
  });
  return gsiReady;
}

export function isSignedIn(scope = SCOPE_READ) {
  return !!token && token.expiresAt > Date.now() + 30000 && scope.split(' ').every((s) => token.scopes.has(s));
}

export function signOut() {
  if (token?.access_token && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(token.access_token, () => {}); } catch { /* 失効済みなら無視 */ }
  }
  token = null;
}

/**
 * アクセストークンを取得する（必要なときだけ同意画面を出す）。
 * @param {string} clientId Google Cloud の OAuth クライアントID（ウェブ）
 * @param {string} scope    半角スペース区切りのスコープ
 */
export async function signIn(clientId, scope = SCOPE_READ) {
  if (!clientId) throw new Error('クライアントIDが未設定です');
  if (isSignedIn(scope)) return token.access_token;
  await loadGsi();
  // すでに持っているスコープは維持したまま追加する（仮押さえのときの追加同意）
  const want = new Set([...(token?.scopes || []), ...scope.split(' ')]);
  const scopes = [...want].join(' ');
  if (!tokenClient || clientIdInUse !== clientId || tokenClient.__scope !== scopes) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: scopes, callback: () => {} });
    tokenClient.__scope = scopes;
    clientIdInUse = clientId;
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = (res) => {
      if (res.error) return reject(new Error(oauthMessage(res)));
      token = { access_token: res.access_token, scopes: new Set((res.scope || scopes).split(' ')), expiresAt: Date.now() + (Number(res.expires_in || 3600) * 1000) };
      resolve(token.access_token);
    };
    try { tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' }); } catch (e) { reject(e); }
  });
}

function oauthMessage(res) {
  if (res.error === 'popup_closed_by_user' || res.error === 'access_denied') return 'Googleの認証がキャンセルされました';
  if (res.error === 'idpiframe_initialization_failed') return 'このドメインがOAuthクライアントの承認済みJavaScript生成元に登録されていません';
  return `Google認証エラー: ${res.error_description || res.error}`;
}

async function call(path, { method = 'GET', body, params } = {}) {
  if (!token) throw new Error('未接続です');
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = detail?.error?.message || res.statusText;
    if (res.status === 401) { token = null; throw new Error(`接続の有効期限が切れました（再接続してください）: ${msg}`); }
    if (res.status === 403) throw new Error(`権限が足りません: ${msg}`);
    throw new Error(`カレンダーAPIエラー(${res.status}): ${msg}`);
  }
  return res.json();
}

/** 参照できるカレンダー一覧（自分＋共有されているもの）。 */
export async function listCalendars() {
  const out = [];
  let pageToken;
  do {
    const page = await call('/users/me/calendarList', { params: { maxResults: 250, minAccessRole: 'freeBusyReader', showHidden: 'true', pageToken } });
    for (const c of page.items || []) {
      out.push({ id: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary, color: c.backgroundColor || '#8ab4f8', canWrite: c.accessRole === 'owner' || c.accessRole === 'writer' });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  out.sort((a, b) => (b.primary - a.primary) || a.name.localeCompare(b.name, 'ja'));
  return out;
}

/**
 * 指定期間の埋まっている時間帯を取得する。
 * @returns {Promise<{busy:Array<{start:string,end:string}>, errors:Array<{id:string,reason:string}>}>}
 */
export async function freeBusy(calendarIds, timeMin, timeMax, timeZone) {
  const ids = [...new Set(calendarIds)].filter(Boolean);
  const busy = [];
  const errors = [];
  // freeBusy の items は 1リクエスト50件までなので分割して投げる
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await call('/freeBusy', {
      method: 'POST',
      body: {
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        items: chunk.map((id) => ({ id })),
      },
    });
    for (const [id, cal] of Object.entries(res.calendars || {})) {
      for (const e of cal.errors || []) errors.push({ id, reason: e.reason });
      for (const b of cal.busy || []) busy.push({ start: b.start, end: b.end });
    }
  }
  return { busy, errors };
}

/** 候補枠を「仮」の予定としてカレンダーに登録する（＝仮押さえ）。 */
export async function createHold(calendarId, { start, end, summary, description, timeZone, transparent = false }) {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: {
      summary,
      description,
      start: { dateTime: new Date(start).toISOString(), timeZone: tz },
      end: { dateTime: new Date(end).toISOString(), timeZone: tz },
      transparency: transparent ? 'transparent' : 'opaque',
      visibility: 'private',
      reminders: { useDefault: true },
    },
  });
}

/**
 * 祝日の一覧（'YYYY-MM-DD' の Set）。
 * 祝日カレンダーの予定は「予定なし(transparent)」扱いのため freeBusy では埋まらない。
 * そこで events.list で日付を取り、除外日として渡す。
 */
export async function listHolidays(timeMin, timeMax, calendarId = JP_HOLIDAY_CALENDAR) {
  const out = new Set();
  let pageToken;
  do {
    const page = await call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      params: {
        timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: 250, pageToken,
      },
    });
    for (const e of page.items || []) {
      if (e.start?.date) {              // 終日（祝日は基本こちら）
        for (let d = e.start.date; d < (e.end?.date || e.start.date); d = nextDate(d)) out.add(d);
      } else if (e.start?.dateTime) {
        const d = new Date(e.start.dateTime);
        out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

function nextDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
