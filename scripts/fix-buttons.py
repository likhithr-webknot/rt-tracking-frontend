#!/usr/bin/env python3
"""Strip redundant inline styles from rt-btn elements across all JSX files."""

import re
import glob

REDUNDANT_PATTERNS = [
    r'\bpx-[0-9]+\b',
    r'\bpy-[0-9.]+\b',
    r'\btext-xs\b',
    r'\btext-\[11px\]\b',
    r'\btext-\[10px\]\b',
    r'\btext-sm\b',
    r'\buppercase\b',
    r'\btracking-widest\b',
    r'\btracking-wider\b',
    r'\bfont-semibold\b',
    r'\bfont-bold\b',
    r'\bfont-medium\b',
]


def strip_redundant(text):
    result = text
    for pat in REDUNDANT_PATTERNS:
        result = re.sub(pat + r'\s*', '', result)
    result = re.sub(r'  +', ' ', result)
    result = result.strip()
    return result


def process_static_classname(match):
    full = match.group(0)
    if 'rt-btn-primary' not in full and 'rt-btn-ghost' not in full and 'rt-btn-danger' not in full:
        return full
    prefix = 'className="'
    suffix = '"'
    inner = full[len(prefix):-len(suffix)]
    cleaned = strip_redundant(inner)
    return prefix + cleaned + suffix


def process_array_classname(match):
    full = match.group(0)
    if 'rt-btn-primary' not in full and 'rt-btn-ghost' not in full and 'rt-btn-danger' not in full:
        return full

    def clean_inner_string(sm):
        s = sm.group(0)
        inner = s[1:-1]  # strip quotes
        cleaned = strip_redundant(inner)
        return s[0] + cleaned + s[-1]

    return re.sub(r'"[^"]*"', clean_inner_string, full)


def main():
    files = sorted(glob.glob('src/components/**/*.jsx', recursive=True))
    total = 0
    for fpath in files:
        with open(fpath, 'r') as f:
            content = f.read()
        original = content

        # Process static className="..." containing rt-btn
        content = re.sub(
            r'className="[^"]*rt-btn-[^"]*"',
            process_static_classname,
            content,
        )

        # Process className={[...].join(" ")} patterns
        content = re.sub(
            r'className=\{[^}]*rt-btn-[^}]*\}',
            process_array_classname,
            content,
        )

        if content != original:
            total += 1
            with open(fpath, 'w') as f:
                f.write(content)
            print(f'  Fixed: {fpath}')

    print(f'\nTotal files changed: {total}')


if __name__ == '__main__':
    main()
