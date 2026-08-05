# 効果コマンド仕様

## 共通方針

- プレイヤーが行った参加宣言は任意に取り消せない。
- `REMOVE_QUEST_PARTICIPATION`によるカード効果では参加状態を解除できる。
- `SEARCH_DECK`は対象カードの移動後、検索したデッキをシャッフルする。
- 期間指定のない能力値・タグ変更は、現在処理している依頼中だけ有効とする。
- パッシブ由来の継続効果は、効果元が有効な間だけ適用する。
- 公開した残りのカードは、カード定義に応じて山札の上または下へ戻す。

## 領域移動

### `MOVE_CARD`

選択済みカードを任意の領域へ移動する。

```json
{
  "type": "MOVE_CARD",
  "params": {
    "source": "FIELD",
    "destination": "GRAVEYARD",
    "deckPosition": "TOP",
    "faceUp": true
  }
}
```

`source`は省略可能。山札への移動では`deckPosition`に`TOP`または`BOTTOM`を指定できる。

### `MOVE_TOP_CARDS`

対象プレイヤーの山札の上から`amount`枚を移動する。リソースへ送ったカードは裏向きになる。

### `SEARCH_DECK`

山札から対象選択したカードを移動し、移動後に山札をシャッフルする。

### `REVEAL_TOP_AND_TAKE`

対象定義の`filter.top`で山札上の公開範囲を制限し、その中から選択したカードを移動する。

```json
{
  "target": {
    "type": "DECK",
    "amount": 1,
    "filter": { "top": 5 }
  },
  "commands": [{
    "type": "REVEAL_TOP_AND_TAKE",
    "params": {
      "revealedCount": 5,
      "destination": "HAND",
      "remainingPosition": "BOTTOM"
    }
  }]
}
```

`remainingPosition`は`TOP`または`BOTTOM`。

## 冒険者とカード状態

- `DAMAGE`: ダメージを加える。`params.unpreventable`で軽減不能情報を保持する。
- `HEAL`: ダメージを回復する。
- `LOSE_MP`: MPを消費させる。`params.requireFullPayment`がコストと効果の差を表す。
- `GAIN_MP`: 使用済みMPを回復する。
- `MODIFY_STAT`: `params.modifiers`の能力値を変更する。既定期間は`QUEST`。
- `DOUBLE_STAT` / `HALVE_STAT`: `params.abilities`で指定した各能力値の現在値を2倍または半分にする。半減時の端数は切り上げる。`params.duration`は`QUEST`（既定）または`PERMANENT`。
- `ADD_TAG` / `REMOVE_TAG`: タグを変更する。既定期間は`QUEST`。
- `FLIP_FACE_DOWN` / `FLIP_FACE_UP`: カードの表裏を変更する。
- `ADD_COUNTER` / `REMOVE_COUNTER`: 名前付き汎用カウンターを増減する。

### `ADD_STATUS` / `REMOVE_STATUS`

プレイヤーを対象にした場合は冒険者へ、カードを対象にした場合はそのカードへ名前付き状態を付与・解除する。状態名は`status`で指定する。同じ状態は複数保持でき、`REMOVE_STATUS`で`amount`を省略すると同名状態をすべて解除する。

`params.duration`は次の値を取る。

- `QUEST`: 現在解決中の依頼が終了するまで。省略時の既定値。
- `TURN`: 現在のターンが終了するまで。
- `OWNER_TURN_START`: 対象プレイヤーの次のターン開始時まで。
- `PERMANENT`: 明示的に解除されるまで。

`QUEST`を依頼の処理外で付与することはできない。

## 効果の発動条件

`effect.condition`には単一条件または論理条件を指定できる。

- `ALL`: `params.conditions`の全条件を満たす。
- `ANY`: `params.conditions`のいずれかを満たす。
- `NOT`: `params.condition`を満たさない。
- `PLAYER_LEVEL`: 効果の管理者のレベルを比較する。
- `PLAYER_STAT`: `params.ability`の能力値を比較する。`params.quest`が`true`なら依頼中能力値、`false`なら通常能力値を参照する。省略時は依頼処理中だけ依頼中能力値を参照する。
- `PLAYER_TAG` / `PLAYER_STATUS`: 効果の管理者が指定タグ・状態を持つか判定する。
- `SOURCE_COUNTER` / `SOURCE_STATUS`: 効果元カードの指定カウンター数・状態を判定する。
- `QUEST_TAG`: 現在処理中の依頼が指定タグを持つか判定する。

数値条件は`operator`に`==`、`!=`、`>`、`>=`、`<`、`<=`を指定する。タグ・状態条件は通常は所持していれば真となり、`NOT`または`NOT_HAS`を指定すると反転する。

```json
{
  "condition": {
    "type": "ALL",
    "params": {
      "conditions": [
        { "type": "PLAYER_LEVEL", "operator": ">=", "value": 3 },
        {
          "type": "PLAYER_STAT",
          "operator": ">=",
          "value": 5,
          "params": { "ability": "STRENGTH", "quest": true }
        },
        { "type": "QUEST_TAG", "value": "DANGER" }
      ]
    }
  }
}
```

## 誘発タイミング

- `ENTER`: 効果元カードが表向きでフィールドへ移動した時。
- `LEAVE`: 表向きの効果元カードがフィールドを離れた時。
- `TURN_START`: ターンプレイヤーが場に持つ表向きカードについて、開始時の回復・表向き化の後に発動する。
- `TURN_END`: ターンプレイヤーが場に持つ表向きカードについて、次のプレイヤーへ交代する前に発動する。
- `QUEST_SUCCESS` / `QUEST_FAILURE`: 依頼の成否決定後、ダメージ・報酬・依頼書移動より前に誘発する。

誘発効果の対象選択やMP置換選択は通常の効果と同じ選択継続処理を使う。同時に発生した誘発効果は効果1件ごとに同一バッチへ登録する。1件だけなら自動解決し、複数ある場合は発生時点のターンプレイヤーから時計回りに、各プレイヤーが自分の誘発効果の解決順を選択する。同一カードに同じタイミングの効果が複数ある場合も個別の誘発として扱う。

## 依頼書

- `MODIFY_QUEST`: 達成条件、報酬、ダメージ、タグを実行時に変更する。
- `DECLARE_QUEST_PARTICIPATION`: カード効果で参加状態にする。
- `REMOVE_QUEST_PARTICIPATION`: カード効果で参加状態を解除する。
- `SET_QUEST_TIMING`: `THIS_TURN`または`NEXT_TURN`を指定する。

依頼の実行時変更はカード定義を書き換えず、個々のカードインスタンスへ保持する。

## 継続効果レイヤー

表向きで場にあるパッシブ型の特技・特徴が持つ`CONTINUOUS`効果を、必要な処理の直前に集計する。裏向きまたは場を離れたカードの効果は適用しない。

### `REDUCE_DAMAGE`

受けるダメージを`amount`点軽減する。複数存在する場合は合計し、結果は0未満にならない。`params.questTags`を指定すると、そのタグをすべて持つ依頼のダメージだけを軽減する。

### `PREVENT_QUEST_DAMAGE`

`params.questTags`をすべて持つ依頼中のダメージを0にする。`unpreventable`が指定されたダメージには適用しない。

### `MODIFY_RESOURCE_GAIN`

リソース獲得枚数へ`amount`を加える。現在は依頼成功報酬と、山札上からリソースを得る`MOVE_TOP_CARDS`へ適用する。場のカードをリソースへ送る処理は「獲得」として扱わない。

### タグ依存の`MODIFY_STAT`

`params.questTags`を指定した`MODIFY_STAT`は、そのタグをすべて持つ依頼の達成値計算時だけ適用する。

### `REPLACE_MP_WITH_COUNTER`

MP消費の代わりに、効果元カードへカウンターを置ける任意の置換効果。

```json
{
  "type": "REPLACE_MP_WITH_COUNTER",
  "params": {
    "counter": "CHARGE",
    "counterPerMp": 1,
    "maxCounters": 3
  }
}
```

上限を超える置換は候補にならない。候補が1件以上あれば、MPを消費するプレイヤーが「置換せずMPを消費」または使用する置換効果を選ぶ。他プレイヤーの効果によってMPを消費させられる場合も、影響を受けるプレイヤーへ選択要求を出す。

軽減不能ダメージはダメージ無効と軽減の両方を無視する。ダメージ無効が適用可能なら軽減より先に処理する。

### `MODIFY_EQUIPMENT_SLOTS`

表向きで場にあるカードの`CONTINUOUS`効果として、装備枠または装飾品上限を増減する。

```json
{
  "trigger": "CONTINUOUS",
  "target": { "type": "SELF" },
  "commands": [{
    "type": "MODIFY_EQUIPMENT_SLOTS",
    "params": {
      "slots": { "WEAPON": 1, "SHIELD": -1 },
      "accessoryLimit": 1
    }
  }]
}
```

複数枠を使う装備品は、従来の`equipmentSlot`の代わりに`equipmentSlots`を指定する。

```json
{
  "type": "EQUIPMENT",
  "equipmentSlots": {
    "WEAPON": 1,
    "SHIELD": 1
  }
}
```

枠の減少で上限を超えた場合は、状況起因処理として所有者が残す装備品を選ぶ。
