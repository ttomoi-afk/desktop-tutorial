// firebase-config.js — paste your Firebase *web app* config here to turn on
// cloud real-time sync for the whole team. This config is NOT a secret (it is
// meant to ship in client apps); access is controlled by Realtime Database
// security rules — see README.md「クラウド同期のセットアップ」.
//
// Firebase コンソール → プロジェクトの設定 → マイアプリ（ウェブ）→ SDK の設定と構成
// からコピーした構成。この値は公開情報（秘密鍵ではない）で、アクセスは
// Realtime Database のセキュリティルールで制御します。

export const firebaseConfig = {
  apiKey: 'AIzaSyCMmmRrrIUtVrtM9zTRdmO_5yQbvcW3qp8',
  authDomain: 'teamenergy-749ba.firebaseapp.com',
  databaseURL: 'https://teamenergy-749ba-default-rtdb.firebaseio.com',
  projectId: 'teamenergy-749ba',
  storageBucket: 'teamenergy-749ba.firebasestorage.app',
  messagingSenderId: '288794314201',
  appId: '1:288794314201:web:2ed0903bdfc5eaeef705c8',
  measurementId: 'G-CYTSBP4SQX',
};

// true になったらクラウド同期が有効。未設定（YOUR_… のまま）ならローカルモードで動作。
export function isConfigured(cfg = firebaseConfig) {
  return !!(cfg && cfg.databaseURL && cfg.apiKey &&
    !/YOUR_/.test(cfg.databaseURL) && !/YOUR_/.test(cfg.apiKey));
}
