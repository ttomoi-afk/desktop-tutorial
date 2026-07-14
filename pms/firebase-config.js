// firebase-config.js — paste your Firebase *web app* config here to turn on
// cloud real-time sync for the whole team. This config is NOT a secret (it is
// meant to ship in client apps); access is controlled by Realtime Database
// security rules — see README.md「クラウド同期のセットアップ」.
//
// Firebase コンソール → プロジェクトの設定 → マイアプリ（ウェブ）→ SDK の設定と構成
// からコピーした値で、下の YOUR_… を置き換えてください。databaseURL は必須です。

export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT',
  appId: 'YOUR_APP_ID',
};

// true になったらクラウド同期が有効。未設定（YOUR_… のまま）ならローカルモードで動作。
export function isConfigured(cfg = firebaseConfig) {
  return !!(cfg && cfg.databaseURL && cfg.apiKey &&
    !/YOUR_/.test(cfg.databaseURL) && !/YOUR_/.test(cfg.apiKey));
}
