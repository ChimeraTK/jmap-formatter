#!/usr/bin/env python3
# SPDX-License-Identifier: LGPL-3.0-or-later
# SPDX-FileCopyRightText: Deutsches Elektronen-Synchrotron DESY, MSK, ChimeraTK Project <chimeratk-support@desy.de>
"""jmap formatter.

Re-formats ChimeraTK .jmap files. The syntax is JSON, so base formatting follows standard
JSON rules (2-space indent, ': ' and ', ' separators). On top of that, well-known *leaf*
objects are compacted onto the fewest lines that fit within MAX_LINE_LENGTH: a single
line when the whole object fits, otherwise its scalar members are packed onto as few
lines as possible (never exceeding 120 chars). Empty objects/arrays render as '{}'/'[]'
and non-ASCII characters are preserved verbatim.

Compacted object keys (cannot have children in the schema):
    address, representation, selectedBy, secondaryBufferAddress, INTC
Compacted array keys (flat lists of scalars, compacted when they fit):
    options, triggeredByInterrupt

MAX_LINE_LENGTH (120 chars) is the overriding rule: nothing, including the compacted
object/array keys above, is allowed to exceed it.

Usage:
    python3 jmapfmt.py fix <files...>          # rewrite files in place
    python3 jmapfmt.py check <files...>        # exit 1 if any file is not formatted (no writes)
    python3 jmapfmt.py check < list_of_files   # read the file list from stdin
    python3 jmapfmt.py stdin                   # read from stdin, write formatted text to stdout
"""

import argparse
import json
import sys

MAX_LINE_LENGTH = 120

# Object keys whose value is a schema leaf (no children): render on one line if it fits.
COMPACT_OBJECT_KEYS = {"address", "representation", "selectedBy", "secondaryBufferAddress", "INTC"}
# Array keys whose value is a flat list of scalars: render on one line if it fits.
COMPACT_ARRAY_KEYS = {"options", "triggeredByInterrupt"}


def _scalar(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return json.dumps(value, ensure_ascii=False)


def _inline(value):
    """Render a value on a single (compact) line, e.g. {'a': 1, 'b': 2} or [1, 2, 3]."""
    if isinstance(value, dict):
        if not value:
            return "{}"
        return "{" + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_inline(v)}" for k, v in value.items()) + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        return "[" + ", ".join(_inline(v) for v in value) + "]"
    return _scalar(value)


def _ind(n):
    return "  " * n


def _obj_body(indent, members):
    """Lines for the body of an object (no outer braces), with commas between members."""
    groups = []
    for k, v in members:
        if isinstance(v, (dict, list)):
            groups.append(_keyed_member_lines(indent, k, v))
        else:
            groups.append([_ind(indent) + f"{json.dumps(k, ensure_ascii=False)}: {_scalar(v)}"])
    out = []
    for i, g in enumerate(groups):
        out.extend(g)
        if i < len(groups) - 1:
            out[-1] = out[-1] + ","
    return out


def _arr_body(indent, items):
    """Lines for the body of an array (no outer brackets), with commas between items."""
    groups = []
    for item in items:
        if isinstance(item, dict):
            if not item:
                g = [_ind(indent) + "{}"]
            else:
                g = [_ind(indent) + "{"] + _obj_body(indent + 1, list(item.items())) + [_ind(indent) + "}"]
        elif isinstance(item, list):
            if not item:
                g = [_ind(indent) + "[]"]
            else:
                g = [_ind(indent) + "["] + _arr_body(indent + 1, item) + [_ind(indent) + "]"]
        else:
            g = [_ind(indent) + _scalar(item)]
        groups.append(g)
    out = []
    for i, g in enumerate(groups):
        out.extend(g)
        if i < len(groups) - 1:
            out[-1] = out[-1] + ","
    return out


def _obj_body_packed(indent, members):
    """Lines for the body of a compact leaf object that does not fit on one line.

    Members are packed onto as few lines as possible, with each line (including the
    current indentation) kept within MAX_LINE_LENGTH. This avoids the all-or-nothing
    behaviour of fully expanding every member once the single-line form overflows.
    """
    pad = _ind(indent)
    pieces = []
    for k, v in members:
        kk = json.dumps(k, ensure_ascii=False)
        if isinstance(v, (dict, list)):
            pieces.append(f"{kk}: {_inline(v)}")
        else:
            pieces.append(f"{kk}: {_scalar(v)}")
    lines = []
    current = ""
    for piece in pieces:
        candidate = (current + ", " + piece) if current else piece
        if len(pad) + len(candidate) <= MAX_LINE_LENGTH:
            current = candidate
        else:
            lines.append(current)
            current = piece
    if current:
        lines.append(current)
    out = []
    for i, line in enumerate(lines):
        out.append(pad + line + ("," if i < len(lines) - 1 else ""))
    return out


def _keyed_member_lines(indent, key, value):
    """Lines for `key: <dict|list>`, first line carries the key, no trailing comma.

    Known leaf objects are compacted: if the whole object fits MAX_LINE_LENGTH it is
    rendered on a single line, otherwise its scalar members are packed onto the fewest
    lines that stay within MAX_LINE_LENGTH. Short scalar arrays are always compacted.
    """
    pad = _ind(indent)
    if isinstance(value, dict):
        if not value:
            return [pad + f"{json.dumps(key, ensure_ascii=False)}: {{}}"]
        if key in COMPACT_OBJECT_KEYS:
            line = f"{json.dumps(key, ensure_ascii=False)}: {_inline(value)}"
            if len(line) <= MAX_LINE_LENGTH - 2 * indent:
                return [pad + line]
            # Too long for a single line: pack the members greedily, each line <= MAX_LINE_LENGTH.
            return [pad + f"{json.dumps(key, ensure_ascii=False)}: {{"] + _obj_body_packed(
                indent + 1, list(value.items())) + [pad + "}"]
        return [pad + f"{json.dumps(key, ensure_ascii=False)}: {{"] + _obj_body(indent + 1, list(value.items())) + [pad + "}"]
    # list
    if not value:
        return [pad + f"{json.dumps(key, ensure_ascii=False)}: []"]
    if key in COMPACT_ARRAY_KEYS:
        line = f"{json.dumps(key, ensure_ascii=False)}: {_inline(value)}"
        if len(line) <= MAX_LINE_LENGTH - 2 * indent:
            return [pad + line]
        # The 120-char rule takes precedence: fall back to expanded form.
    return [pad + f"{json.dumps(key, ensure_ascii=False)}: ["] + _arr_body(indent + 1, value) + [pad + "]"]


def format_text(text):
    """Return the formatted representation of a jmap/JSON document, or None if unparseable."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    out = ["{"]
    out += _obj_body(1, list(data.items()))
    out.append("}")
    return "\n".join(out) + "\n"


def _read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_file(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def main():
    parser = argparse.ArgumentParser(
        prog="jmapfmt",
        description="Re-format ChimeraTK .jmap files.",
        epilog="Examples:\n"
               "  jmapfmt fix a.jmap b.jmap      # rewrite in place\n"
               "  jmapfmt check a.jmap           # verify, exit 1 if not formatted\n"
               "  find . -name '*.jmap' | jmapfmt check\n"
               "  jmapfmt stdin < a.jmap         # write formatted text to stdout",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True, metavar="{fix,check,stdin}")

    p_fix = sub.add_parser("fix", help="rewrite files in place",
                           description="Rewrite the given files in place, adding or fixing formatting.")
    p_fix.add_argument("files", nargs="+", metavar="FILE",
                       help="the .jmap files to rewrite")

    p_check = sub.add_parser("check", help="verify formatting, no writes; exit 1 on mismatch",
                             description="Verify that the given files are formatted. "
                                         "No files are modified; exits 1 if any file differs. "
                                         "If no files are given, paths are read from stdin, one per line.")
    p_check.add_argument("files", nargs="*", metavar="FILE",
                         help="the .jmap files to check; if omitted, read paths from stdin")

    p_stdin = sub.add_parser("stdin", help="read jmap text from stdin, write formatted text to stdout",
                             description="Read a jmap document from stdin and write the formatted "
                                         "result to stdout. Exits 1 on unparseable input.")

    args = parser.parse_args()

    if args.command == "stdin":
        text = sys.stdin.read()
        formatted = format_text(text)
        if formatted is None:
            print("jmapfmt: ERROR: stdin is not valid JSON", file=sys.stderr)
            sys.exit(1)
        sys.stdout.write(formatted)
        sys.exit(0)

    if args.command == "check" and not args.files:
        args.files = [line.strip() for line in sys.stdin if line.strip()]

    bad = 0
    for path in args.files:
        original = _read_file(path)
        formatted = format_text(original)
        if formatted is None:
            print(f"jmapfmt: ERROR: could not parse {path} (invalid JSON)", file=sys.stderr)
            bad = 1
            continue
        if args.command == "check":
            if original != formatted:
                print(f"jmapfmt: {path} is not formatted")
                bad = 1
        else:  # fix
            if original != formatted:
                _write_file(path, formatted)
                print(f"jmapfmt: formatted {path}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
