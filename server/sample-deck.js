export const SAMPLE_DECK_ID = 'sample-python-loop';

const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W5mQAAAAASUVORK5CYII=';
const SAMPLE_PNG_BUFFER = Buffer.from(SAMPLE_PNG_BASE64, 'base64');

export function createSampleDeckPayload() {
    return {
        schemaVersion: 2,
        title: 'Pythonループ入門',
        description: 'for文とwhile文、画像アセットの確認用サンプル',
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
                    '',
                    '![構成図](asset://images/overview.png)',
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
                title: '出力・共有の準備',
                fileRef: 'README.md',
                lineRange: [1, 4],
                highlightLines: [3, 4],
                markdown: [
                    '# 出力・共有の準備',
                    '',
                    '- HTML/PDF/ZIP で出力して共有できます。',
                    '- このサンプルには画像アセットが含まれています。',
                ].join('\n'),
            },
        ],
        terminal: {
            cwd: '',
        },
        assets: [
            {
                path: 'images/overview.png',
                mimeType: 'image/png',
                kind: 'image',
                size: SAMPLE_PNG_BUFFER.length,
            },
        ],
    };
}

export function createSampleDeckAssets() {
    return [
        {
            path: 'images/overview.png',
            mimeType: 'image/png',
            kind: 'image',
            buffer: SAMPLE_PNG_BUFFER,
        },
    ];
}
