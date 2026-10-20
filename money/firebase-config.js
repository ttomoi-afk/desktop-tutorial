// firebase-config.js — クラウド共有（他のユーザーからも見られるようにする）用の
// Firebase ウェブアプリ構成。pms と同じプロジェクトを使う。
// この値は公開情報（秘密鍵ではない）で、アクセスは Realtime Database の
// セキュリティルールで制御する（README「共有のセットアップ」を参照）。

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

// 未設定（YOUR_… のまま）ならローカルモードで動作。
export function isConfigured(cfg = firebaseConfig) {
  return !!(cfg && cfg.databaseURL && cfg.apiKey &&
    !/YOUR_/.test(cfg.databaseURL) && !/YOUR_/.test(cfg.apiKey));
}
