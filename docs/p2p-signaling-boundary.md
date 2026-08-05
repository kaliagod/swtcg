# P2Pシグナリング境界

## 目的

WebRTCの通信路と、SDP・ICE候補を対戦相手へ渡す方法を分離する。
現在はVercelまたはローカルAPIを使うルームID方式を既定とし、
外部Storeやサーバーを差し替えてもゲーム通信を変更しない構造とする。

## 責務

| コンポーネント | 責務 |
|---|---|
| `WebRtcPeerSession` | Offer/Answerの生成と適用、DataChannelの送受信、接続状態通知 |
| `SignalingProvider` | Offer/Answerを相手へ受け渡す方法の共通境界 |
| `ManualSignalingProvider` | Offer/Answerと手動接続コードの相互変換 |
| `RoomSignalingProvider` | ルームAPIの呼び出しとホスト側の短時間ポーリング |
| `P2PConnectionCoordinator` | WebRTCセッションとProviderを接続し、募集・参加・応答確定を進行 |
| `RoomSignalingService` | ルーム、期限、トークン、Offer/Answerを検証・管理 |
| `MemoryRoomStore` | ローカルNodeサーバー用の一時保存 |
| `UpstashRoomStore` | Vercel Functions用のRedis REST保存 |
| `app.js` | 画面状態とユーザー操作。SDPや接続コードの形式は扱わない |

`WebRtcPeerSession`はルームID、HTTP、接続コードを知らない。
`ManualSignalingProvider`はWebRTC API、ゲーム状態、カードコマンドを知らない。

## Provider契約

シグナリング方式は次の4メソッドを実装する。

```js
class RoomSignalingProvider extends SignalingProvider {
    async publishOffer(offer) {}
    async resolveOffer(invitationReference) {}
    async publishAnswer(answer, { invitationReference }) {}
    async resolveAnswer(responseReference) {}
}
```

- `publishOffer(offer)`: Offerを公開し、相手へ渡す参照値を返す。
- `resolveOffer(invitationReference)`: 参照値からOfferを取得する。
- `publishAnswer(answer, context)`: Answerを公開し、必要ならホスト用参照値を返す。
- `resolveAnswer(responseReference)`: 参照値からAnswerを取得する。
- `close()`: 任意。購読、ポーリング、ソケットなどを終了する。

参照値は方式固有である。手動方式ではBase64接続コード、ルーム方式では
ルームID、短期トークン、またはProvider内部に保持した接続情報を使用できる。

## 現在の手動方式

1. ホストの`WebRtcPeerSession`がOfferを生成する。
2. `ManualSignalingProvider.publishOffer()`が募集コードへ変換する。
3. 参加者が募集コードを入力する。
4. ProviderがOfferへ戻し、参加者のWebRTCセッションがAnswerを生成する。
5. ProviderがAnswerを参加コードへ変換する。
6. ホストが参加コードを入力し、AnswerをWebRTCセッションへ適用する。
7. DataChannel開通後はシグナリングProviderをゲーム通信に使用しない。

## 現在のルーム方式

ルームAPIは`POST /api/signaling`へJSONを送信する。

| action | 主な入力 | 応答 |
|---|---|---|
| `CREATE` | `offer` | `roomId`, `hostToken`, `expiresAt` |
| `JOIN` | `roomId` | `offer`, `guestToken`, `expiresAt` |
| `ANSWER` | `roomId`, `guestToken`, `answer` | `accepted` |
| `STATUS` | `roomId`, `hostToken` | `PENDING`または`READY`と`answer` |
| `CLOSE` | `roomId`, `hostToken` | `closed` |

- ルームIDは紛らわしい文字を除いた10文字（約50ビット）で、有効期限は10分。
- ホスト用トークンはブラウザのProvider内だけに保持し、画面へ表示しない。
- 参加トークンはサーバー秘密鍵で署名し、Answer登録時に検証する。
- Answerは最初の1件だけを受理し、後続の参加者は拒否する。
- ホストは800ミリ秒間隔、最大2分間`STATUS`を確認する。
- Offer/AnswerのSDPは64KiB以下に制限する。
- API応答は`Cache-Control: no-store`とする。

DataChannel開通後、ゲームコマンドはルームAPIを経由せずWebRTCで直接送信する。

## 保存先

- `npm.cmd start`: Nodeプロセス内の`MemoryRoomStore`を使用する。
- Vercel Functions: `UpstashRoomStore`を使用する。
- RedisキーはTTL付きで保存し、期限後に自動削除する。

Vercel本番環境では次の環境変数が必須である。

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SIGNALING_SECRET
```

`SIGNALING_SECRET`は32文字以上とする。APIと画面を別オリジンに置く場合は、
許可するオリジンを`SIGNALING_ALLOWED_ORIGINS`へカンマ区切りで指定する。
未指定時は同一オリジンからの利用だけを想定する。

個人サーバーへ移行する場合は同じAPIまたはProvider契約を実装し、
`RoomSignalingProvider`の`endpoint`を変更する。ゲームエンジン側は変更不要である。

## 本番安定化の状態

- `CREATE`と`JOIN`には、Upstash Redisで共有する送信元IP単位のレート制限を実装済み。
- 参加トークンと回答取得は一回限りで、RedisのLua処理により原子的に消費する。
- STUN／TURN設定は環境変数から`GET /api/network-config`経由で配布する。
- 接続タイムアウト、再試行、キャンセル、失敗理由の診断表示を実装済み。
- Vercel Preview、実Upstash、TURN、異なる外部回線の実地検証は環境構築後に行う。
- 切断後の試合復帰方式はM3の対象外であり、引き続き未決定。

詳細は[M3 通信の本番安定化](m3-production-networking.md)を参照する。
