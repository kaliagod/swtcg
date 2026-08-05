# M3 通信の本番安定化

## 実装済みの境界

- ルームIDは、紛らわしい文字を除いた32文字種・10文字（約50ビット）です。追加PINは現時点では採用していません。
- ルーム有効期限の既定値は10分です。
- `CREATE`と`JOIN`は送信元IP単位でレート制限され、カウンターはUpstash RedisでVercel Functions間に共有されます。
- 参加トークンはランダム生成され、参加枠の予約時にハッシュだけをRedisへ保存します。回答登録時に原子的に検証・削除されるため、一回しか使えません。
- ホストトークンもハッシュ保存され、ホストが回答を取得した時点でルーム、回答、予約情報を原子的に削除します。
- ICEサーバー情報は`GET /api/network-config`から取得し、STUN・TURNの両方を設定できます。
- ICE候補収集、API要求、相手の回答待ち、DataChannel確立に個別のタイムアウトがあります。
- 接続中のキャンセル、失敗後の再試行、エラーコード／HTTP状態／待機秒数の診断表示があります。
- 通信設定APIだけが失敗した場合は既定のGoogle STUNへフォールバックし、画面へ警告を表示します。

## Vercel Previewの環境変数

`.env.example`を基準に、VercelのPreview環境へ次を設定します。

必須:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SIGNALING_SECRET`（32文字以上のランダム値）
- `WEBRTC_ICE_SERVERS_JSON`

任意:

- `SIGNALING_ALLOWED_ORIGINS`: APIを別オリジンから呼ぶ場合だけ設定します。同一Vercel配置なら空で構いません。
- `SIGNALING_ROOM_TTL_SECONDS`: 60～3600、既定600。
- `SIGNALING_CREATE_LIMIT`: 既定6回。
- `SIGNALING_CREATE_WINDOW_SECONDS`: 既定60秒。
- `SIGNALING_JOIN_LIMIT`: 既定30回。
- `SIGNALING_JOIN_WINDOW_SECONDS`: 既定60秒。
- `SIGNALING_REQUEST_TIMEOUT_MS`: 1000～30000、既定10000ミリ秒。
- `WEBRTC_ICE_GATHER_TIMEOUT_MS`: 1000～60000、既定12000ミリ秒。
- `WEBRTC_CONNECTION_TIMEOUT_MS`: 5000～120000、既定30000ミリ秒。

`WEBRTC_ICE_SERVERS_JSON`の例:

```json
[
  { "urls": "stun:stun.example.com:3478" },
  {
    "urls": [
      "turn:turn.example.com:3478?transport=udp",
      "turns:turn.example.com:5349?transport=tcp"
    ],
    "username": "temporary-user",
    "credential": "temporary-password"
  }
]
```

TURN認証情報はWebRTCクライアントへ渡す必要があるため、ブラウザから確認可能です。長期固定パスワードを置く場合は利用量監視と定期ローテーションが必要です。将来はTURN事業者の期限付き認証情報発行APIへ置き換えるのが安全です。

## Preview検証手順

1. `npm.cmd test`を実行します。
2. Upstash RedisをVercel Previewへ接続し、上記環境変数をPreviewへ登録します。
3. Previewを配置し、`GET /api/network-config`がICE設定を返すことを確認します。
   PowerShellで`$env:M3_BASE_URL="https://..."; npm.cmd run test:m3:deployment`を実行すると、Preview APIと実Upstashに対する一回限りトークンを含む統合試験を行えます。TURNをまだ設定しない試験だけは事前に`$env:M3_REQUIRE_TURN="0"`も指定します。
4. 端末Aでルームを作成し、端末Bで参加します。両画面が対戦画面へ遷移することを確認します。
5. Upstash側でルーム、参加予約、回答のキーが期限付きで作成され、接続成立後に削除されることを確認します。
6. 同じ参加トークンによる回答再送が拒否されることをAPIテストで確認します。
7. 同一IPから作成上限を超えて呼び、HTTP 429、`RATE_LIMITED`、`Retry-After`が表示されることを確認します。
8. 存在しないID、10分経過したID、停止したUpstashをそれぞれ試し、画面に`ROOM_NOT_FOUND`または`SIGNALING_STORE_UNAVAILABLE`が表示されることを確認します。
9. 家庭回線の端末と、Wi-Fiを切った携帯回線端末で双方向にホスト／参加者を入れ替えて接続します。
10. TURN動作確認時はブラウザのWebRTC内部情報で`relay`候補が選ばれていることを確認します。

## 完了判定

コードと自動テストだけで判定できる項目は実装済みです。M3全体の完了には、実資格情報を使ったVercel Preview、Upstash Redis、TURN、および家庭回線＋携帯回線の実地試験が必要です。試験結果は日時、端末、ブラウザ、回線、ホスト側、選択候補種別、診断コードを記録します。

## 現時点で対象外

- 切断後に進行中ゲームへ復帰する再接続
- TURN期限付き認証情報のサーバー発行
- CAPTCHAやアカウント単位の制限
- DDoS対策（Vercel／Upstash／TURN提供者側の機能を利用）
