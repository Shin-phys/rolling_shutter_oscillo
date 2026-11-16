# 実機検証の記録

検証ツール（`tools/rs-check/`）などで確かめた結果を、新しいものを上に書く。
結論が出た未決事項は `06-open-issues.md` で解決済みへ移し、ここを参照先にする。

## 2026-11-16　iPhone（iOS 18.7、Safari）

### 検証ツールの動作

- GitHub Pages 上で、合成サンプルの解析が正しく動いた。

### ブラウザからのカメラ制御（RS-Q-12）

- 露光時間を手動で設定できない。`getCapabilities()` に `exposureMode`・`exposureTime`・`iso` がない。
- 報告された機能：解像度は最大 4032×3024、フレームレートは 1〜60 fps、ズーム 0.5〜10、ライト（`torch`）あり、ホワイトバランスは手動・自動。
- 実際の設定：1080×1920（縦向き）、30 fps、カメラは「背面デュアル広角カメラ」。

<details>
<summary>ツールが表示した内容（そのまま）</summary>

```json
{
  "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1",
  "label": "背面デュアル広角カメラ",
  "settings": {
    "aspectRatio": 0.5625, "backgroundBlur": false, "facingMode": "environment", "frameRate": 30,
    "height": 1920, "powerEfficient": false, "torch": false, "whiteBalanceMode": "continuous", "width": 1080, "zoom": 1
  },
  "capabilities": {
    "aspectRatio": { "max": 4032, "min": 0.00033068783068783067 },
    "backgroundBlur": [false], "facingMode": ["environment"], "focusDistance": { "min": 0.02 },
    "frameRate": { "max": 60, "min": 1 }, "height": { "max": 3024, "min": 1 }, "powerEfficient": [false, true],
    "torch": true, "whiteBalanceMode": ["manual", "continuous"], "width": { "max": 4032, "min": 1 },
    "zoom": { "max": 10, "min": 0.5 }
  }
}
```

（`deviceId` と `groupId` は省いた。）
</details>

### ここから言えること

- iPhone では、ブラウザのライブ映像の露光を短くできない。露光を短くするには、強い光で自動露出に短くさせるか、露出を手動で設定できるカメラアプリで撮った動画を読み込む（RS-F-02）。RS-Q-02（入力の方式）を決めるときの材料になる。
- Android（Chrome）は未検証。
