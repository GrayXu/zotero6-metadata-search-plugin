# Zotero 6 Metadata Search Plugin

Update Zotero items with metadata from CrossRef and DBLP.

## Features
- Right-click menu entry in the item list
- Search CrossRef and DBLP by title/creators
- Auto-pull DBLP BibTeX results
- One-click update of selected fields

## Install
- Download the latest `.xpi` from GitHub Releases.
- In Zotero 6, go to Tools -> Add-ons -> Install Add-on From File.

## Development
- The plugin entry point is `bootstrap.js`.
- UI is in `content/dialog.xul` and `content/dialog.js`.
- Default prefs are in `defaults/preferences/prefs.js`.

## Attribution
This project is a fork of [ajdavis/zotero-metadata-search-plugin](https://github.com/ajdavis/zotero-metadata-search-plugin).
