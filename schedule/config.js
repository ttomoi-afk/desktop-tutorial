// config.js — Google OAuth クライアントID。
// この値は「クライアントに埋め込む前提の公開情報」で、秘密鍵ではありません
// （firebase-config.js と同じ考え方）。アクセスは Google Cloud 側の
// 「承認済みJavaScript生成元」とユーザー本人の同意で守られます。
//
// 取得手順は README.md「セットアップ」を参照。未設定のままでも、
// 画面の「接続設定」からIDを貼り付ければこの端末だけで使えます。

export const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';

export function isConfigured(id = GOOGLE_CLIENT_ID) {
  return !!id && !/YOUR_/.test(id) && /\.apps\.googleusercontent\.com$/.test(id);
}
