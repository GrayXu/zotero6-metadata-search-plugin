# Zotero 6 Metadata Search Plugin

Update Zotero items with metadata from CrossRef and DBLP.

## Features
- Right-click menu entry in the item list
- Search CrossRef and DBLP by title/creators
- Auto-pull DBLP BibTeX results and expose extra fields
- One-click update of selected fields

## Install
- Download the latest `.xpi` from GitHub Releases.
- In Zotero 6, go to Tools -> Add-ons -> Install Add-on From File.

## Development
- The plugin entry point is `bootstrap.js`.
- UI is in `content/dialog.xul` and `content/dialog.js`.
- Default prefs are in `defaults/preferences/prefs.js`.

## Release
Push a tag like `v0.0.4` to trigger GitHub Actions and publish a release.
