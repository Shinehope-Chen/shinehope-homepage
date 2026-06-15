# Shinehope Homepage

This is a static personal homepage for Shinehope.

## Publish With GitHub Pages

Upload the contents of this folder to a public GitHub repository, then enable:

- Settings > Pages
- Source: Deploy from a branch
- Branch: main
- Folder: /root

The site entry point is `index.html`.

## Maintenance Note

When adding a new feature or topic page, add both Simplified Chinese and English versions and connect them through the language switcher.

The travel map uses aggregated city-level data generated from the local footprint CSV. Do not publish raw GPS trajectory points.

Travel photos are published as compressed web copies under `assets/travel-photos/`, with the city-to-photo index in `assets/travel-photos.js`. Updating the local photo folder later requires regenerating and pushing these web assets.
