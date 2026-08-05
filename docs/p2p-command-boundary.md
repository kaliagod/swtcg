# P2P向けコマンド入力／公開状態出力境界

## 目的

通信層、画面、ゲームエンジンを分離するため、外部からのゲーム操作は
`GameCommandGateway.execute()`へJSONコマンドとして渡す。
実行側はコマンドを検証してエンジンを呼び出し、内部オブジェクトではなく
閲覧者別に秘匿処理した公開状態を返す。

WebRTCデータチャネルによる2人対戦を実装済み。ホストをプレイヤー1、
参加者をプレイヤー2へ固定して通信経路とプレイヤーIDを結び付ける。
ホストが正規ゲーム状態を保持し、参加者は閲覧者別公開状態だけを保持する。

## コマンド形式

```json
{
  "protocolVersion": 1,
  "id": "peer1-00042",
  "type": "PLAY_CARD",
  "playerId": 1,
  "expectedRevision": 12,
  "payload": {
    "cardInstanceId": "CARD_123",
    "resourceCardIds": ["CARD_91", "CARD_92"]
  }
}
```

- `protocolVersion`: 現在は`1`のみ。
- `id`: 送信側が生成する一意なコマンドID。同じ内容の再送は再実行しない。
- `type`: `GameCommandTypes`に定義した操作種別。
- `playerId`: コマンドを行うプレイヤー。
- `expectedRevision`: 送信側が操作判断に使用した状態リビジョン。
- `payload`: 操作固有のJSONデータ。

配列位置は通信中に変化し得るため、カードはインデックスではなく
`instanceId`で指定する。

## 送信者の照合

`execute(command, { authenticatedPlayerId })`の
`authenticatedPlayerId`は通信・認証層が設定する。
コマンド内の`playerId`と一致しない場合は
`AUTHENTICATED_PLAYER_MISMATCH`として拒否する。

`authenticatedPlayerId`を省略したコマンドも拒否する。
クライアントが申告した`playerId`を認証結果としてそのまま使用してはならない。

## リビジョンと再送

- 受理されたコマンドごとに状態の`revision`を1増やす。
- 現在値と`expectedRevision`が異なる新規コマンドは
  `STALE_REVISION`として拒否する。
- 同一ID・同一内容の受理済みコマンドは`replayed: true`で応答し、
  ゲーム処理を再実行しない。
- 同一IDで内容が異なる場合は`COMMAND_ID_CONFLICT`として拒否する。
- 対象や支払いなど次の選択要求を生成した操作も、状態を変更した受理済み
  コマンドとしてリビジョンを進める。

## 対応コマンド

| type | payload |
|---|---|
| `BEGIN_GAME` | なし |
| `MULLIGAN` | なし |
| `ADVANCE_PHASE` | なし |
| `PLAY_CARD` | `cardInstanceId`, 任意で`resourceCardIds` |
| `PLAY_GROWTH_CARD` | `cardInstanceId`, 任意で`resourceCardIds` |
| `ACTIVATE_CARD` | `cardInstanceId` |
| `ACTIVATE_ADVENTURE_CARD` | `cardInstanceId` |
| `DECLARE_QUEST_PARTICIPATION` | `questInstanceId` |
| `COMPLETE_QUEST_PARTICIPATION` | なし |
| `START_QUEST_PREPARATION` | `questInstanceId` |
| `PASS_QUEST_PREPARATION` | なし |
| `RESOLVE_QUEST` | `questInstanceId` |
| `RESOLVE_SELECTION` | `requestId`, `selectedIds` |

手札・冒険者デッキ・自分のフィールドから操作するカードは、
コマンド実行者が所有する該当領域内だけを検索する。
依頼書は表向きのフィールドカードだけを検索する。

## 応答形式

```json
{
  "protocolVersion": 1,
  "accepted": true,
  "reason": null,
  "commandId": "peer1-00042",
  "type": "PLAY_CARD",
  "playerId": 1,
  "commandRevision": 13,
  "replayed": false,
  "publicState": {
    "protocolVersion": 1,
    "revision": 13,
    "state": {}
  }
}
```

エンジンが返すカード、プレイヤー、ゾーンなどの内部オブジェクトは応答へ
含めない。`publicState.state`は`GameStateSerializer`の閲覧者別出力である。

## 公開状態の配布

`getPublicState(viewerPlayerId)`は指定プレイヤー自身の非公開領域だけを公開する。
`getPublicState(null)`は観戦者向けで、全プレイヤーの非公開領域を伏せる。

同じ公開状態を全接続先へブロードキャストしてはならない。
各接続先の認証済みプレイヤーIDごとに個別生成する。

現在秘匿される主な情報は次のとおり。

- 他プレイヤーの手札
- 他プレイヤーのリソース
- 全プレイヤーのデッキ内容
- 他プレイヤーの冒険者デッキ
- 他プレイヤーの裏向きカード
- 他プレイヤーだけが回答できる選択の候補と文脈

## WebRTC接続

- 接続処理はWebRTC通信路、シグナリングProvider、接続進行へ分離している。
- 現在の既定ProviderはルームID方式で、手動接続コード方式も選択できる。
- ホームの「対戦」からホストまたは参加者を選ぶ。
- ルーム方式ではホストがルームIDを渡し、参加者はIDを入力する。AnswerはAPI経由で自動返送する。
- 手動方式ではホストが募集コードを渡し、参加者が作成した参加コードをホストへ返す。
- 接続コードにはSDPとICE候補が含まれるため、対戦相手以外へ公開しない。
- 接続後、各自のデッキを検証してゲームを開始する。
- WebRTCのDTLSによって通信経路は暗号化される。
- ルーム方式ではAPIがOffer/Answerだけを有効期限付きで仲介する。
- 手動方式では外部サーバーを使用せず、SDPとICE候補を接続コードとして交換する。
- Provider契約と将来のルーム方式は`docs/p2p-signaling-boundary.md`を参照する。

参加者から届いたコマンドは、通信経路へ固定したプレイヤー2として
`GameCommandGateway`へ渡す。コマンド内の申告IDだけで認証しない。

## 現在の範囲外

- 切断・再接続時の受理済みコマンドID永続化
- 状態署名、改ざん検知、ホスト不正への対策
- 乱数結果の合意方式
- 観戦者権限の詳細
- TURNサーバーは環境設定から利用可能。実サーバーでの中継確認は未完了。
- シグナリングAPIはRedis共有のIPレート制限と10文字ルームIDを実装済み。

現実装は、ゲーム状態を保持する権威ノードがコマンドを検証・実行し、
接続先ごとの公開状態を返す方式の基盤である。
