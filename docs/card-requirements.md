# カード条件の定義形式

カードを使用する条件は `useRequirements`、依頼へ参加する条件は依頼書の `participationRequirements` に指定します。複数の条件はすべて満たす必要があります。

```json
{
  "useRequirements": {
    "minLevel": 2,
    "minStats": {
      "STRENGTH": 3
    },
    "requiredTags": ["EXPLORER"],
    "forbiddenTags": ["UNDEAD"]
  }
}
```

- `minLevel`: 必要な最低レベル。
- `minStats`: 能力値ごとの最低値。使用条件では通常能力値、参加条件では装備品などの依頼中補正を含む能力値を参照する。
- `requiredTags`: すべて所持している必要があるタグ。
- `forbiddenTags`: いずれも所持していてはいけないタグ。

省略された項目には制限がありません。同じタグを必須と禁止の両方へ指定した定義、未知の能力値や項目を含む定義、依頼書以外に `participationRequirements` を指定した定義は読み込み時に拒否されます。
