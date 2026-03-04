#!/usr/bin/env python3
"""
Replace inline button patterns in EmployeePortal.jsx and ManagerPortal.jsx
with standardized rt-btn-* classes.
"""
import re

files_to_fix = [
    'src/components/employee/EmployeePortal.jsx',
    'src/components/manager/ManagerPortal.jsx',
]

# Pattern: the big inline button class string
INLINE_BTN_PATTERN = (
    r'"inline-flex items-center gap-2 rounded-lg px-6 py-3 '
    r'font-semibold text-xs uppercase tracking-widest transition-all"'
)

# The ghost-style inline button in EmployeePortal
GHOST_INLINE = (
    'className="inline-flex items-center gap-2 rounded-lg px-6 py-3 '
    'font-semibold text-xs uppercase tracking-widest border '
    'border-[rgb(var(--border))] text-[rgb(var(--text))] '
    'hover:bg-[rgb(var(--surface-2))] transition-all"'
)

# Also handle the proof modal buttons
PROOF_CANCEL = (
    'className="rounded-md px-5 py-3 text-xs font-semibold uppercase tracking-widest '
    'border border-[rgb(var(--border))] text-[rgb(var(--text))] '
    'hover:bg-[rgb(var(--surface-2))] transition-all"'
)
PROOF_SUBMIT_PATTERN = re.compile(
    r'"rounded-md px-5 py-3 text-xs font-semibold uppercase tracking-widest transition-all"'
)

for fpath in files_to_fix:
    try:
        with open(fpath, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        continue

    original = content

    # 1) Replace the big inline pattern in array joins
    content = content.replace(
        '"inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold text-xs uppercase tracking-widest transition-all"',
        '"rt-btn-primary transition-all"'
    )

    # 2) Replace standalone ghost inline button
    content = content.replace(
        GHOST_INLINE,
        'className="rt-btn-ghost transition-all"'
    )

    # 3) Replace proof modal cancel button
    content = content.replace(
        PROOF_CANCEL,
        'className="rt-btn-ghost transition-all"'
    )

    # 4) Fix the conditional styling: the "active" state uses bg-purple-600...
    # and the "disabled" state uses bg-[rgb(var(--surface-2))]...
    # Since we now use rt-btn-primary as the base, we need to handle the disabled look differently.
    # Replace the purple active style with empty (rt-btn-primary handles it)
    content = content.replace(
        '"bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20"',
        '""'
    )

    # Replace emerald active style (submit buttons) with a success class
    content = content.replace(
        '"bg-emerald-500 text-white hover:bg-emerald-400 shadow-xl shadow-emerald-900/20"',
        '"bg-[rgb(var(--success))] text-white hover:opacity-90"'
    )

    # The disabled conditional styling should override to look like ghost
    content = content.replace(
        '"bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"',
        '"!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"'
    )

    if content != original:
        with open(fpath, 'w') as f:
            f.write(content)
        print(f'  Fixed: {fpath}')
    else:
        print(f'  No changes: {fpath}')


print('\nDone.')
