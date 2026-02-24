/**
 * Sample Slides: Pythonでバブルソートを学ぼう
 *
 * Each slide has:
 *  - title: Slide title
 *  - code: Source code to display
 *  - language: Programming language
 *  - highlightLines: Lines to highlight (1-based)
 *  - shell: Array of { type: 'command'|'output', text } or null
 *  - markdown: Explanation in markdown (supports KaTeX, Mermaid)
 */

export const sampleSlides = [
    {
        title: "バブルソートとは？",
        code: `# バブルソート (Bubble Sort)
# 隣接する要素を比較して交換するシンプルなソートアルゴリズム

def bubble_sort(arr):
    """配列をバブルソートで昇順にソートする"""
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

# 使用例
data = [64, 34, 25, 12, 22, 11, 90]
print(f"ソート前: {data}")
result = bubble_sort(data)
print(f"ソート後: {result}")`,
        language: "python",
        highlightLines: [4, 5, 6, 7, 8, 9, 10],
        shell: [
            { type: "command", text: "python bubble_sort.py" },
            { type: "output", text: "ソート前: [64, 34, 25, 12, 22, 11, 90]" },
            { type: "output", text: "ソート後: [11, 12, 22, 25, 34, 64, 90]" },
        ],
        markdown: `# バブルソートとは？

**バブルソート**は最も基本的なソートアルゴリズムの1つです。

## 基本的な考え方

隣り合う2つの要素を比較し、順序が逆なら**交換**します。これをリストの先頭から末尾まで繰り返します。

> [!TIP]
> 名前の由来：大きな値が泡（バブル）のように配列の末尾に浮かび上がっていく様子から名付けられました。

## 計算量

| ケース | 計算量 |
|---|---|
| 最良 | $O(n)$ |
| 平均 | $O(n^2)$ |
| 最悪 | $O(n^2)$ |

空間計算量は $O(1)$ で、**インプレース**でソートを行います。

\`\`\`mermaid
graph LR
    A["64, 34, 25, 12"] --> B["比較 & 交換"]
    B --> C["34, 25, 12, 64"]
    C --> D["繰り返し"]
    D --> E["12, 25, 34, 64"]
\`\`\``
    },
    {
        title: "ステップ1: 外側のループ",
        code: `def bubble_sort(arr):
    n = len(arr)

    # 外側のループ: n回繰り返す
    # 各パスで最大の未ソート要素が正しい位置に移動
    for i in range(n):
        print(f"--- パス {i + 1} ---")

        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]

        print(f"  結果: {arr}")

    return arr

data = [64, 34, 25, 12]
bubble_sort(data)`,
        language: "python",
        highlightLines: [4, 5, 6, 7],
        shell: [
            { type: "command", text: "python step1.py" },
            { type: "output", text: "--- パス 1 ---" },
            { type: "output", text: "  結果: [34, 25, 12, 64]" },
            { type: "output", text: "--- パス 2 ---" },
            { type: "output", text: "  結果: [25, 12, 34, 64]" },
            { type: "output", text: "--- パス 3 ---" },
            { type: "output", text: "  結果: [12, 25, 34, 64]" },
            { type: "output", text: "--- パス 4 ---" },
            { type: "output", text: "  結果: [12, 25, 34, 64]" },
        ],
        markdown: `# ステップ1: 外側のループ

## 外側のループの役割

\`for i in range(n)\` は**パス（巡回）**を制御します。

各パスでは、まだソートされていない部分の中で**最大の要素**が末尾に移動します。

## 動作のイメージ

$$\\text{パス } k \\text{ の後: 末尾 } k \\text{ 個がソート済み}$$

### パスごとの配列の変化

| パス | 配列の状態 | ソート済み |
|---|---|---|
| 初期 | \`[64, 34, 25, 12]\` | なし |
| 1 | \`[34, 25, 12, **64**]\` | 64 ✓ |
| 2 | \`[25, 12, **34**, 64]\` | 34, 64 ✓ |
| 3 | \`[12, **25**, 34, 64]\` | 25, 34, 64 ✓ |

> [!NOTE]
> パス4では交換が起こらず、配列は既にソート済みです。この点を後で最適化に活かします。`
    },
    {
        title: "ステップ2: 内側のループと比較",
        code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):

        # 内側のループ: 隣接要素を比較
        # n - i - 1: 末尾のソート済み部分はスキップ
        for j in range(0, n - i - 1):

            # 隣の要素と比較
            if arr[j] > arr[j + 1]:
                # 交換（スワップ）
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                print(f"  交換: {arr[j+1]} ↔ {arr[j]}")
            else:
                print(f"  維持: {arr[j]} ≤ {arr[j+1]}")

    return arr

data = [64, 34, 25, 12]
print(f"初期状態: {data}")
bubble_sort(data)
print(f"結果: {data}")`,
        language: "python",
        highlightLines: [7, 10, 12],
        shell: [
            { type: "command", text: "python step2.py" },
            { type: "output", text: "初期状態: [64, 34, 25, 12]" },
            { type: "output", text: "  交換: 64 ↔ 34" },
            { type: "output", text: "  交換: 64 ↔ 25" },
            { type: "output", text: "  交換: 64 ↔ 12" },
            { type: "output", text: "  交換: 34 ↔ 25" },
            { type: "output", text: "  交換: 34 ↔ 12" },
            { type: "output", text: "  交換: 25 ↔ 12" },
            { type: "output", text: "結果: [12, 25, 34, 64]" },
        ],
        markdown: `# ステップ2: 内側のループと比較

## 内側のループの役割

\`for j in range(0, n - i - 1)\` で隣接する要素を順に比較します。

### なぜ \`n - i - 1\` ？

各パスの後、末尾 $i$ 個の要素はソート済みなのでスキップできます。

$$\\text{比較回数} = \\sum_{i=0}^{n-1} (n - i - 1) = \\frac{n(n-1)}{2}$$

## 交換（スワップ）の仕組み

Pythonでは**タプルアンパッキング**で簡潔に書けます：

\`\`\`python
# 一般的な方法（一時変数）
temp = arr[j]
arr[j] = arr[j + 1]
arr[j + 1] = temp

# Pythonのタプルアンパッキング ✨
arr[j], arr[j + 1] = arr[j + 1], arr[j]
\`\`\`

> [!TIP]
> Pythonのタプルアンパッキングは内部的に同時代入を行うため、一時変数が不要です！`
    },
    {
        title: "最適化: 早期終了フラグ",
        code: `def bubble_sort_optimized(arr):
    """最適化版: 交換が行われなかったら早期終了"""
    n = len(arr)

    for i in range(n):
        swapped = False  # 交換フラグ

        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True  # 交換が発生

        # 交換がなければソート完了
        if not swapped:
            print(f"  パス {i + 1} で早期終了！")
            break

        print(f"  パス {i + 1}: {arr}")

    return arr

# ほぼソート済みのデータ
data = [11, 12, 22, 25, 64, 34, 90]
print(f"初期: {data}")
bubble_sort_optimized(data)
print(f"結果: {data}")`,
        language: "python",
        highlightLines: [6, 11, 14, 15, 16],
        shell: [
            { type: "command", text: "python optimized.py" },
            { type: "output", text: "初期: [11, 12, 22, 25, 64, 34, 90]" },
            { type: "output", text: "  パス 1: [11, 12, 22, 25, 34, 64, 90]" },
            { type: "output", text: "  パス 2 で早期終了！" },
            { type: "output", text: "結果: [11, 12, 22, 25, 34, 64, 90]" },
        ],
        markdown: `# 最適化: 早期終了フラグ

## 問題点

基本的なバブルソートは、配列が**既にソート済み**でも全パスを実行します。

## 解決策: \`swapped\` フラグ

パス中に1度も交換が起こらなければ、配列はソート済みです。

\`\`\`mermaid
flowchart TD
    A["パス開始"] --> B["swapped = False"]
    B --> C{"要素を比較"}
    C -->|"交換あり"| D["swapped = True"]
    C -->|"交換なし"| E["次の要素へ"]
    D --> E
    E --> F{"全要素比較?"}
    F -->|"いいえ"| C
    F -->|"はい"| G{"swapped?"}
    G -->|"True"| A
    G -->|"False"| H["ソート完了 🎉"]
\`\`\`

## 最適化の効果

| データの状態 | 基本版 | 最適化版 |
|---|---|---|
| ランダム | $O(n^2)$ | $O(n^2)$ |
| ほぼソート済み | $O(n^2)$ | $O(n)$ 👍 |
| ソート済み | $O(n^2)$ | $O(n)$ 👍 |

> [!IMPORTANT]
> 最良ケースが $O(n^2)$ から $O(n)$ に改善されます！`
    },
    {
        title: "可視化と比較",
        code: `import time

def bubble_sort_visual(arr):
    """可視化つきバブルソート"""
    n = len(arr)
    comparisons = 0
    swaps = 0

    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            comparisons += 1
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swaps += 1
                swapped = True

            # 配列の状態を表示
            visual = ""
            for k, v in enumerate(arr):
                if k == j or k == j + 1:
                    visual += f"[{v}]"
                else:
                    visual += f" {v} "
            print(f"  {visual}")

        if not swapped:
            break

    print(f"\\n比較回数: {comparisons}")
    print(f"交換回数: {swaps}")
    return arr

data = [5, 3, 8, 1, 2]
print(f"\\nソート開始: {data}\\n")
bubble_sort_visual(data)
print(f"\\n完了: {data}")`,
        language: "python",
        highlightLines: [19, 20, 21, 22, 23, 24, 25],
        shell: [
            { type: "command", text: "python visual.py" },
            { type: "output", text: "" },
            { type: "output", text: "ソート開始: [5, 3, 8, 1, 2]" },
            { type: "output", text: "" },
            { type: "output", text: "  [3][5] 8  1  2 " },
            { type: "output", text: "   3 [5][8] 1  2 " },
            { type: "output", text: "   3  5 [1][8] 2 " },
            { type: "output", text: "   3  5  1 [2][8]" },
            { type: "output", text: "  [3][5] 1  2  8 " },
            { type: "output", text: "   3 [1][5] 2  8 " },
            { type: "output", text: "   3  1 [2][5] 8 " },
            { type: "output", text: "  [1][3] 2  5  8 " },
            { type: "output", text: "   1 [2][3] 5  8 " },
            { type: "output", text: "" },
            { type: "output", text: "比較回数: 9" },
            { type: "output", text: "交換回数: 7" },
            { type: "output", text: "" },
            { type: "output", text: "完了: [1, 2, 3, 5, 8]" },
        ],
        markdown: `# 可視化と他のアルゴリズムとの比較

## ソートの各ステップ

\`[]\` で囲まれた要素が現在**比較中のペア**です。

## 他のソートアルゴリズムとの比較

| アルゴリズム | 最良 | 平均 | 最悪 | 安定性 | メモリ |
|---|---|---|---|---|---|
| **バブルソート** | $O(n)$ | $O(n^2)$ | $O(n^2)$ | ✅ | $O(1)$ |
| 選択ソート | $O(n^2)$ | $O(n^2)$ | $O(n^2)$ | ❌ | $O(1)$ |
| 挿入ソート | $O(n)$ | $O(n^2)$ | $O(n^2)$ | ✅ | $O(1)$ |
| マージソート | $O(n\\log n)$ | $O(n\\log n)$ | $O(n\\log n)$ | ✅ | $O(n)$ |
| クイックソート | $O(n\\log n)$ | $O(n\\log n)$ | $O(n^2)$ | ❌ | $O(\\log n)$ |

## バブルソートの適用場面

- ✅ 学習・教育目的
- ✅ ほぼソート済みの小さなデータ
- ✅ 安定ソートが必要な場合
- ❌ 大規模データの実用には不向き

> [!NOTE]
> **安定ソート**とは、同じ値を持つ要素の相対的な順序がソート後も保たれるソートのことです。

## まとめ

バブルソートは実用面では遅いですが、**ソートの基本的な考え方**を学ぶのに最適なアルゴリズムです。ここで学んだ「比較と交換」の概念は、他のソートアルゴリズムを理解する土台になります 🎓`
    },
];
