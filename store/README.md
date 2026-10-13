# Store listing pack

Everything needed to publish QRX in the Chrome Web Store (under MakerX's existing publisher account) and in Microsoft
Edge Add-ons (Partner Center). Each store gets its own zip: the two builds differ only in the OAuth client, so the
sign-in consent screen names the browser the extension came from.

| File                                                       | What                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`listing.md`](listing.md)                                 | Every listing and privacy field, in the order the two dashboards ask for them |
| [`privacy-policy-addition.md`](privacy-policy-addition.md) | The browser-extension section the QRX privacy policy needs before submission  |
| `assets/icon-128.png`                                      | Store icon, 128x128 (96x96 art, 16 px transparent padding)                    |
| `assets/edge-logo-300.png`                                 | Edge store logo, 300x300                                                      |
| `assets/promo-small-440x280.png`                           | Small promo tile (Chrome and Edge)                                            |
| `assets/marquee-1400x560.png`                              | Marquee promo tile (Chrome) / large promotional tile (Edge)                   |
| `assets/screenshots/1-create.png` … `4-sign-in.png`        | Screenshots, 1280x800, captured from the real popup                           |

Regenerate the images with `npm run screenshots` and `npm run store:assets` (see the main README).

## Before submitting (both stores)

1. **API on prod:** MakerXStudio/qrxcodes#513 (OAuth tokens per resource; `/v1` accepts audience `https://qrx.codes/v1`)
   must be deployed to qrx.codes. Check: `https://qrx.codes/.well-known/oauth-protected-resource/v1` answers with
   `"resource": "https://qrx.codes/v1"`. Until then, sign-in on the store build fails at the API.
2. **Privacy policy:** add the section in `privacy-policy-addition.md` to https://qrx.codes/privacy, so the policy
   describes the same three kinds of data the store forms declare.
3. **Package:** take the zips from the latest green CI run on `main` (Actions → CI → artifacts):
   `qrx-extension-<version>.zip` for Chrome and `qrx-extension-<version>-edge.zip` for Edge. Both are store builds:
   qrx.codes only, no manifest `key`.

## Publish on Chrome (MakerX publisher account)

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) signed in to the
   MakerX publisher account that publishes Nutshell. (2-step verification and the trader declaration are already on
   that account.)
2. **Items → New item**, upload the zip. Don't submit yet. Copy the new item's ID from the dashboard URL or the item
   page: the extension's sign-in redirect URI is `https://<chrome-item-id>.chromiumapp.org/`.
3. **Prod Clerk OAuth app** (clerk.qrx.codes dashboard → Configure → OAuth applications → Add):
   - Name **QRX for Chrome**, public client (no secret), PKCE required, consent screen on.
   - Scopes `qrx:read qrx:generate offline_access`.
   - Redirect URI: `https://<chrome-item-id>.chromiumapp.org/`.
   - Copy its **client ID** into the GitHub repo variable `QRX_OAUTH_CLIENT_ID_PROD` (Settings → Secrets and
     variables → Actions → Variables). It is public, not a secret.
   - Re-run CI on `main` and take the new zip. (Without a client ID the extension still signs in, by registering itself
     with Clerk on each install; the pre-registered app keeps the consent screen consistent and the Clerk app list
     clean.)
4. Reviewer account: `qrx-chrome-review` (`chrome-review@qrx.codes`) in prod Clerk, public metadata
   `{"isPaid": true}`, password in the team vault as "QRX Chrome reviewer".
5. On the item, **Package → Upload new package** with the new zip.
6. **Store listing** tab: fill the fields from `listing.md` (Chrome column), upload the icon, screenshots, small promo
   tile and marquee.
7. **Privacy** tab: single purpose, permission justifications, remote code (No), data usage and the three
   certifications, privacy policy URL, all from `listing.md`.
8. **Distribution** tab: Public; all regions; no in-app purchases.
9. **Test instructions** (if the dashboard shows the field; otherwise skip): the reviewer notes from `listing.md`.
10. **Submit for review.** New publishers and new items can take from a few days to a few weeks.
11. After approval: install from the store, sign in with a QRX account, make one code, and check the notification.

## Publish on Edge (Partner Center)

1. Open [Partner Center → Microsoft Edge](https://partner.microsoft.com/dashboard/microsoftedge/overview) with the
   account that will own QRX on Edge (a free developer registration; company verification can take a while, so start
   it early). If the account isn't enrolled in the Edge program yet, enrol through **Account settings → Programs** in
   Partner Center; the direct enrolment link answers "We don't recognize the program".
2. **Create new extension**, upload the Edge zip. Note the extension ID Partner Center shows for it: the redirect URI is
   `https://<edge-extension-id>.chromiumapp.org/`. Edge uses the same `chromiumapp.org` redirect form as Chrome (checked
   with Edge 155: `chrome.identity.getRedirectURL()` returns `https://<id>.chromiumapp.org/`, and the sign-in window
   opens and reaches QRX's sign-in page), so the only difference is the ID.
3. **Prod Clerk OAuth app** **QRX for Edge**, set up like QRX for Chrome (Chrome step 3) with the redirect URI
   `https://<edge-extension-id>.chromiumapp.org/`. Its client ID goes in the repo variable
   `QRX_OAUTH_CLIENT_ID_EDGE_PROD`; re-run CI on `main` and **Packages → Replace** with `qrx-extension-<version>-edge.zip`.
   Reviewer account: `qrx-edge-review` (`edge-review@qrx.codes`), public metadata `{"isPaid": true}`, vault entry
   "QRX Edge reviewer".
4. **Availability:** Public; all markets.
5. **Properties:** category, privacy policy URL (the extension handles personal information: yes), website, support
   URL, mature content (no), from `listing.md` (Edge column).
6. **Store listings → English:** description, store logo (300x300), small and large promotional tiles, screenshots,
   search terms, from `listing.md`.
7. **Submit**, with the reviewer notes from `listing.md` in **Notes for certification**. Review takes up to 7 business
   days.

## Updates

Bump `version` in `manifest.json` (CI also stamps `1.0.<run number>`), take the CI zip, and upload each store's zip as a new
package in its dashboard. The extension IDs, and so the Clerk redirect URIs, never change.
