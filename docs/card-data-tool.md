# Card Data Forge

カテゴリ別のExcelブックを、ゲームが読み込むカード定義JSONへ変換するローカルWebツールです。

## 起動

```powershell
npm.cmd start
```

ブラウザで `http://127.0.0.1:8080/card-tool.html` を開きます。

## 基本手順

1. 画面上部の「Excelテンプレート」からテンプレートを保存します。
2. 対象カテゴリのシートで、2行目のサンプル行を複製します。
3. `enabled` を `TRUE` に変更し、`id` と `name` を含むカード情報を入力します。
4. 効果があるカードは「効果」シートへカードIDと効果を入力します。
5. Excelを画面へドロップし、「JSONへ変換」を実行します。
6. エラーが0件になったら、全カードまたはカテゴリ別のJSONを保存します。

複数のExcelファイルを同時に読み込めます。カードIDは、読み込ませた全ファイルを通して一意である必要があります。

## 入力規則

- タグなどの複数値は `FIRE;MAGIC` のようにセミコロンで区切ります。
- カード本文の複数要素は、1セル内で改行します。
- 空欄の任意項目はJSONへ出力されません。
- `enabled` が `FALSE`、`0`、`無効` の行は出力されません。
- 冒険者カードの基礎能力値は、`base_DEXTERITY`、`base_AGILITY`、`base_STRENGTH`、`base_VITALITY`、`base_INTELLIGENCE`、`base_SPIRIT` の全列へ0以上の整数で入力します。6項目すべて必須です。
- `stat_`、`active_`、`equip_`、`quest_` などの接頭辞が付いた能力値列は、カード種別に応じた修正値・条件値です。

## 効果シート

1行が1つの効果です。同じカードに複数の効果がある場合は行を追加し、`order` で順番を指定します。

| 列 | 内容 |
|---|---|
| `cardId` | 効果を持つカードのID |
| `trigger` | `PLAY`、`ACTIVATE`、`CONTINUOUS` など |
| `conditionJson` | 条件オブジェクト。例: `{"type":"ALWAYS"}` |
| `costJson` | 任意のコストオブジェクト。例: `{"type":"MP","amount":2}` |
| `targetJson` | 任意の対象オブジェクト。例: `{"type":"SELF"}` |
| `commandsJson` | コマンド配列。例: `[{"type":"DRAW","amount":2}]` |

変換時には、既存ゲームエンジンの `CardDefinition` と同じ検証が行われます。エラーにはファイル名・シート名・行番号・カードIDが表示されます。
