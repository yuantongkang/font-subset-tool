from pathlib import Path
path = Path('app.js')
text = path.read_text(encoding='utf-8')
replacements = {
    "正在�?Unicode 范围分组...": "正在按 Unicode 范围分组...",
    "正在创建�?{current}/{total} 个子�?..": "正在创建第 {current}/{total} 个子集...",
    "正在生成 ZIP �?..": "正在生成 ZIP 包..."
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Missing substring: {old}')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
