#!/usr/bin/env python3
"""
Final cleanup: replace remaining inline button patterns across all JSX files
with standardized rt-btn-* classes.
"""
import re
import glob

files = sorted(glob.glob('src/components/**/*.jsx', recursive=True))

# Patterns to replace
replacements = [
    # Full inline button string array entries (most common pattern in Employee/Manager portals)
    (
        '"inline-flex items-center gap-2 rounded-lg px-5 py-3 text-xs font-semibold uppercase tracking-widest transition-all border"',
        '"rt-btn-primary transition-all"'
    ),
    (
        '"inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[10px] font-semibold uppercase tracking-widest transition-all border"',
        '"rt-btn-primary rt-btn-sm transition-all"'
    ),
    (
        '"rounded-lg px-5 py-3 text-xs font-semibold uppercase tracking-widest transition-all"',
        '"rt-btn-primary transition-all"'
    ),
    # Static ghost-style classNames
    (
        'className="rounded-lg px-5 py-3 text-xs font-semibold uppercase tracking-widest border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"',
        'className="rt-btn-ghost transition-all"'
    ),
    (
        'className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"',
        'className="rt-btn-ghost transition-all"'
    ),
    (
        'className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] px-3 py-2 text-[11px] font-semibold uppercase tracking-widest hover:bg-[rgb(var(--surface-2))] transition-all"',
        'className="rt-btn-ghost rt-btn-sm transition-all"'
    ),
    # Submission window closed retry/logout buttons
    (
        'className="mt-5 inline-flex items-center justify-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] px-5 py-3 font-semibold text-[11px] uppercase tracking-widest hover:bg-[rgb(var(--surface-2))] transition-all"',
        'className="mt-5 rt-btn-ghost transition-all"'
    ),
    (
        'className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"',
        'className="rt-btn-ghost transition-all"'
    ),
]

total = 0
for fpath in files:
    with open(fpath, 'r') as f:
        content = f.read()
    original = content

    for old, new in replacements:
        content = content.replace(old, new)

    if content != original:
        total += 1
        with open(fpath, 'w') as f:
            f.write(content)
        print(f'  Fixed: {fpath}')

print(f'\nTotal files changed: {total}')
