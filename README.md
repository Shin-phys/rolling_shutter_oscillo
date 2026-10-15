# ローリングシャッター・オシロ（仮称）

スマホのカメラが画面を1行ずつ順に読み出す性質（ローリングシャッター）を逆用し、1コマの中の読み出し方向を時間軸として読む、高校物理の実験用Webアプリ。
30 fps のカメラのまま、約100 Hz〜数kHz（目安）の点滅や振動を測る。光で測るので、他班の音に邪魔されず、全班が同時に測れる。

## 状態

構想段階。仕様書を作成した段階で、実機検証と実装はまだ行っていない。

## 仕様書

仕様書は [docs/](docs/README.md) にある。

| ファイル | 内容 |
|---|---|
| [docs/README.md](docs/README.md) | 概要・位置づけ・引き継ぎ |
| [docs/01-principle.md](docs/01-principle.md) | 原理、見えるもの、測定範囲、成立の条件 |
| [docs/02-requirements.md](docs/02-requirements.md) | 機能要件・非機能要件 |
| [docs/03-calibration.md](docs/03-calibration.md) | 読み出し時間の校正 |
| [docs/04-shooting-guide.md](docs/04-shooting-guide.md) | 撮影条件と題材ごとの撮り方 |
| [docs/05-lesson-design.md](docs/05-lesson-design.md) | 授業での使い方 |
| [docs/06-open-issues.md](docs/06-open-issues.md) | 未決事項・要検証 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 改訂履歴 |
| [docs/reference/prior-work.md](docs/reference/prior-work.md) | 参考：先行事例 |
| [docs/common/](docs/common/) | 姉妹アプリと共通の開発方針・端末の制約・改訂ルール |

## 姉妹アプリ

- 波の3つの見方：https://github.com/Shin-phys/wave-three-views
- 偏光ラボ：https://github.com/Shin-phys/polarization-lab

## 改訂ルールの要点

- 状態タグ：【決定】【提案】【要検証】
- 要件と未決事項には ID（RS-F-xx、RS-Q-xx）を付け、欠番は再利用しない。
- 1つの決定につき1コミット。決まった未決事項は要件へ反映し、`docs/CHANGELOG.md` に1行残す。

詳細は [docs/common/spec-conventions.md](docs/common/spec-conventions.md) を参照。
