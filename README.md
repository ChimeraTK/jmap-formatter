# jmap-formatter

Formatter and editor support for ChimeraTK `.jmap` device-mapping files.

## Contents

- `jmapfmt.py` — the standalone formatter (Python 3, standard library only).
- `jmap.schema.json` — JSON schema for `.jmap` files.
- `extension/` — a VS Code extension providing `.jmap` language support
  (syntax highlighting, schema validation, formatting, outline, autocomplete,
  hover). See `extension/README.md`.

## Formatter usage

```bash
python3 jmapfmt.py fix <files...>           # rewrite files in place
python3 jmapfmt.py check <files...>         # exit 1 if any file is not formatted
python3 jmapfmt.py check < list_of_files >  # read the file list from stdin
```

## License

LGPL-3.0-or-later. See `LICENSE`.
