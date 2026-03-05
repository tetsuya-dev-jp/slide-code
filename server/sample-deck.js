export const SAMPLE_DECK_ID = 'sample-python-loop';

const SAMPLE_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '  <rect width="640" height="360" fill="#0f172a" />',
    '  <rect x="40" y="60" width="180" height="80" rx="12" fill="#1d4ed8" />',
    '  <rect x="230" y="60" width="180" height="80" rx="12" fill="#059669" />',
    '  <rect x="420" y="60" width="180" height="80" rx="12" fill="#b45309" />',
    '  <text x="130" y="105" text-anchor="middle" fill="#ffffff" font-size="18" font-family="Inter, sans-serif">Code</text>',
    '  <text x="320" y="105" text-anchor="middle" fill="#ffffff" font-size="18" font-family="Inter, sans-serif">Shell</text>',
    '  <text x="510" y="105" text-anchor="middle" fill="#ffffff" font-size="18" font-family="Inter, sans-serif">Markdown</text>',
    '  <line x1="220" y1="100" x2="230" y2="100" stroke="#94a3b8" stroke-width="4" />',
    '  <line x1="410" y1="100" x2="420" y2="100" stroke="#94a3b8" stroke-width="4" />',
    '  <rect x="70" y="210" width="500" height="90" rx="10" fill="#111827" stroke="#334155"/>',
    '  <text x="320" y="250" text-anchor="middle" fill="#e5e7eb" font-size="16" font-family="JetBrains Mono, monospace">slide.markdown + assets</text>',
    '</svg>',
].join('');

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
                    '![構成図](asset://images/overview.svg)',
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
                path: 'images/overview.svg',
                mimeType: 'image/svg+xml',
                kind: 'image',
                size: Buffer.byteLength(SAMPLE_SVG),
            },
        ],
    };
}

export function createSampleDeckAssets() {
    return [
        {
            path: 'images/overview.svg',
            mimeType: 'image/svg+xml',
            kind: 'image',
            buffer: Buffer.from(SAMPLE_SVG, 'utf-8'),
        },
    ];
}
