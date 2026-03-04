export const SAMPLE_DECK_ID = 'sample-python-loop';

export function createSampleDeckPayload() {
    return {
        title: 'Pythonループ入門',
        description: 'for文とwhile文の基本を学ぶサンプルデッキ',
        files: [
            {
                name: 'for_loop.py',
                language: 'python',
                code: [
                    'items = ["apple", "banana", "cherry"]',
                    '',
                    'for index, item in enumerate(items, start=1):',
                    '    print(f"{index}. {item}")',
                ].join('\n'),
            },
            {
                name: 'while_loop.py',
                language: 'python',
                code: [
                    'count = 3',
                    '',
                    'while count > 0:',
                    '    print(f"count: {count}")',
                    '    count -= 1',
                    '',
                    'print("done")',
                ].join('\n'),
            },
            {
                name: 'README.md',
                language: 'markdown',
                code: [
                    '# Pythonループ入門',
                    '',
                    '- `python for_loop.py`',
                    '- `python while_loop.py`',
                ].join('\n'),
            },
        ],
        slides: [
            {
                title: 'for文の基本',
                fileRef: 'for_loop.py',
                lineRange: [1, 4],
                highlightLines: [3, 4],
                markdown: [
                    '# for文の基本',
                    '',
                    '`enumerate(..., start=1)` を使うと、要素と番号を同時に取得できます。',
                ].join('\n'),
            },
            {
                title: 'while文の基本',
                fileRef: 'while_loop.py',
                lineRange: [1, 7],
                highlightLines: [3, 5],
                markdown: [
                    '# while文の基本',
                    '',
                    '条件が `True` の間ループします。',
                    '終了条件を必ず更新するのがポイントです。',
                ].join('\n'),
            },
            {
                title: '実行コマンド',
                fileRef: 'README.md',
                lineRange: [1, 4],
                highlightLines: [3, 4],
                markdown: [
                    '# 実行コマンド',
                    '',
                    'ターミナルからそのまま実行できるコマンド例を同梱しています。',
                ].join('\n'),
            },
        ],
        terminal: {
            cwd: '',
        },
    };
}
