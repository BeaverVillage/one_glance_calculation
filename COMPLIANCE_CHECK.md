# Compliance Check

Last reviewed: 2026-06-16

This note is based on the current repository code. It is a technical compliance check, not legal advice.

## External API Usage

| Service | Purpose | API Key | Sends user files? | Notes |
|---|---|---:|---:|---|
| ExchangeRate-API Open Access (open.er-api.com) | AUD/KRW exchange rate lookup | No | No | Primary reference exchange-rate source. On-screen attribution is shown when this provider is used. |
| @fawazahmed0/currency-api via jsDelivr | AUD/KRW exchange rate fallback | No | No | Public static exchange-rate JSON fallback. Check upstream license/availability before heavy use. |
| @fawazahmed0/currency-api via latest.currency-api.pages.dev | AUD/KRW exchange rate fallback | No | No | Public Cloudflare Pages mirror fallback. |
| Local assets/data/australia-whv-postcodes.json | WHV postcode reference lookup | No | No | Local JSON only; not an official Home Affairs database. |
| Google Analytics (G-D4SBV1Y07N) | Visit statistics | No frontend API key used | No payslip files | Google tag is present in HTML pages. |
| Google AdSense (ca-pub-6340743169950430) | Advertising | Publisher client ID only | No payslip files | AdSense script and ads.txt are present. |
| Coupang Partners iframe | Affiliate advertising | Disabled during AdSense review | No payslip files | Affiliate insertion code removed from assets/js/app.js. |
| pdf.js CDN | PDF parsing library | No | No intentional file upload | Library is loaded from CDN; selected PDF data is passed to browser-side pdf.js. |
| Tesseract.js CDN | OCR library | No | No intentional file upload | Library is loaded from CDN; OCR runs in the browser through Tesseract.js. |

## File Processing

Payslip PDF/image parsing is processed in the browser with FileReader/createImageBitmap/canvas, PDF.js, and Tesseract.js. No uploaded payslip file is intentionally sent to the Hannuncalc server or to an external OCR API in the current repository code.

## Local Storage

- assets/js/australia-pay.js stores the most recent AUD/KRW exchange rate in localStorage under lastAudKrwRate.
- assets/js/app.js stores calculator click ordering in localStorage under hannuncalc.calculatorClicks.v1.

## Advertising / Analytics

Google AdSense: Used
Google Analytics: Used
Coupang Partners iframe: Disabled during AdSense review

## Open Source Notices

Open source notices are available at /licenses.html.

## Remaining Limitations

- This check does not inspect Cloudflare server logs, Google account settings, AdSense settings, or email provider retention settings.
- Home Affairs and exchange-rate data can change after this review date.
- Exchange-rate providers may change terms or availability; recheck before scaling traffic or commercial use.
- This check is not a substitute for legal advice.
