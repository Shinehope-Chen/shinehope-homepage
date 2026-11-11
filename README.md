# Shinehope Homepage

This is a static personal homepage for Shinehope.

## Publish With GitHub Pages

Upload the contents of this folder to a public GitHub repository, then enable:

- Settings > Pages
- Source: Deploy from a branch
- Branch: main
- Folder: /root

The site entry point is `index.html`.

The mobile-ready teleprompter is available at `apps/teleprompter/` and supports local TXT, Markdown (`.md`/`.markdown`), and Word (`.docx`) imports. Legacy `.doc` files are not supported. Scripts are stored in each browser's local storage on that device.

## Maintenance Note

When adding a new feature or topic page, add both Simplified Chinese and English versions and connect them through the language switcher.

The travel map uses city-level markers generated from private local source data. Do not publish the private source records.

Travel photos are published as compressed web copies under `assets/travel-photos/`, with the city-to-photo index in `assets/travel-photos.js`. Updating the local photo folder later requires regenerating and pushing these web assets.
