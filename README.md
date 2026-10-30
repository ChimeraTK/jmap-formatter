# jmapfmt

Formatter for ChimeraTK `.jmap` files.

## Usage

```bash
python3 jmapfmt.py fix <files...>           # rewrite files in place
python3 jmapfmt.py check <files...>         # exit 1 if any file is not formatted
python3 jmapfmt.py check < list_of_files >  # read the file list from stdin
```

Requires only a Python 3 interpreter (standard library).

## Repository layout

- `jmapfmt.py` — the formatter.
- `jmap.schema.json` — JSON schema for `.jmap` files.
- `extension/` — the VS Code extension (language support + formatting). See `extension/README.md`.
