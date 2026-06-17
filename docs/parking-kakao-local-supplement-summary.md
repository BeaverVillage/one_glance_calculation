# Parking public-data geocoding and Kakao Local supplement

This change keeps the static national public-data chunk cache as the primary source and adds two optional supplements:

1. Build-time geocoding for public-data CSV rows that have an address but no valid coordinates.
   - Enable with `PARKING_GEOCODE_MISSING=1` or `--geocode-missing` when running `tools/build-parking-cache.mjs`.
   - Requires `KAKAO_REST_API_KEY`.
   - Uses a local geocode cache at `tools/.parking-geocode-cache.json` by default.

2. Runtime local parking-place supplement when public-data candidates are sparse.
   - Uses Kakao Local keyword search for `주차장` around the selected destination.
   - Requires `KAKAO_REST_API_KEY` in Pages Functions environment variables.
   - Runs only when nearby public-data candidates are fewer than the threshold.
   - Kakao-only candidates are marked with `pricingStatus: "unknown"`, so existing UI displays them as fee-information-limited rather than calculated public-data prices.

No UI, marker, ad, SEO, or layout files were intentionally changed for this supplement.
