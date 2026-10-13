# Listing fields

One set of answers for both stores. Where a store names a field differently, both names are given. Character counts
include spaces. Copy rules: no prices or plan numbers; changing a code's link is always "on a paid plan"; no tier or
plan badges; link codes only.

## Identity

| Field             | Chrome Web Store                    | Edge Add-ons            | Value                                |
| ----------------- | ----------------------------------- | ----------------------- | ------------------------------------ |
| Name              | Item title (from the package)       | Name (from the package) | **QRX: art QR codes that scan** (27) |
| Short description | Summary (from the package, max 132) | Short description       | see below                            |
| Publisher         | MakerX publisher account            | Partner Center account  | MakerX                               |
| Language          | Default language                    | Store listing language  | English                              |
| Version           | from the package                    | from the package        | `1.0.<CI run>`                       |

The name has no "Chrome" in it, as Edge requires; the same package and name go to both stores.

### Short description (128 characters)

> Turn the page you're on into an artistic QR code. Describe a picture, pick a style, and get a code that scans and a
> qrx.to link.

The package's manifest `description` (the Chrome summary, 111 characters) is:

> Make an artistic QR code for the page you're on. Pick a style, describe a picture, and get a qrx.to short link.

### Long description (1,735 characters; Chrome: Description; Edge: Description, at least 250)

```
QRX makes QR codes that people want to look at, and that still scan.

Click the QRX button on any page and the page's address is ready as the code's link. Describe a picture, pick a style, and press Create. QRX builds the QR pattern into the artwork, then decodes the finished image to check it opens the right link before handing it over. You get a print-ready design asset instead of a black-and-white square.

WHAT YOU GET
• An art QR code for the page you're on, or any link you paste.
• Eleven styles to choose from (watercolour, illustration, photographic, pixel art, anime, charcoal and more), or no style at all.
• Every code is checked to scan before you get it.
• A hosted qrx.to short link for every code. On a paid plan you can change where a code points after it has been printed.
• Copy the image, download the PNG, or copy the short link, straight from the popup.
• Recent shows the codes you have made, and everything is also on qrx.codes.

KEEP BROWSING WHILE IT PAINTS
A code takes about a minute. You can close the popup and carry on: QRX finishes the code in the background and shows a notification when it is ready.

SIGN IN WITH QRX
Sign in with your QRX account, or create a free one in the sign-in window. Developers can paste an API key on the settings page instead.

PRIVACY
The extension reads the current tab's address only when you click the QRX button, and sends it to QRX only if you create a code with it. It never reads page content or your browsing history. There are no ads and no tracking. Plans and the privacy policy are on https://qrx.codes.

GOOD TO KNOW
Keep the prompt to the picture you want; QRX handles the code. Test-scan before a large print run and leave a clear margin around the code.
```

## Category and links

| Field              | Chrome Web Store                                                                                         | Edge Add-ons                    | Value                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Category           | Category                                                                                                 | Category                        | Chrome: **Lifestyle → Art & Design** (fallback: Productivity → Tools). Edge: **Productivity** (or Photos, if offered) |
| Homepage / website | Homepage URL                                                                                             | Website                         | https://qrx.codes                                                                                                     |
| Support            | Support URL                                                                                              | Support contact details         | https://qrx.codes/support                                                                                             |
| Privacy policy     | Privacy policy URL (Privacy tab)                                                                         | Privacy policy URL (Properties) | https://qrx.codes/privacy                                                                                             |
| Mature content     | No                                                                                                       | No                              |                                                                                                                       |
| Official URL       | Optional; needs qrx.codes verified in Search Console for the publisher account. Leave empty if it isn't. | n/a                             |                                                                                                                       |
| Search terms       | n/a                                                                                                      | Search terms (up to 7)          | QR code, QR code generator, art QR code, custom QR code, short link, design, branding                                 |

## Images

| Asset       | Chrome Web Store            | Edge Add-ons                    | File                                                                                 |
| ----------- | --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| Icon        | Store icon 128x128          | (from the package)              | `assets/icon-128.png`                                                                |
| Logo        | n/a                         | Extension Store logo 300x300    | `assets/edge-logo-300.png`                                                           |
| Small promo | Small promo tile 440x280    | Small promotional tile 440x280  | `assets/promo-small-440x280.png`                                                     |
| Large promo | Marquee promo tile 1400x560 | Large promotional tile 1400x560 | `assets/marquee-1400x560.png`                                                        |
| Screenshots | 1280x800, up to 5           | 1280x800, up to 10              | `assets/screenshots/1-create.png`, `2-painting.png`, `3-result.png`, `4-sign-in.png` |
| Video       | Optional                    | Optional                        | none                                                                                 |

Screenshot captions, if a store asks: 1 "Describe a picture and pick a style for the page you're on." 2 "Close the popup;
QRX finishes the code in the background." 3 "Copy the image, download the PNG or copy the qrx.to link." 4 "Sign in
with your QRX account."

## Privacy (Chrome: Privacy tab; Edge: Properties and certification notes)

### Single purpose

```
Make an artistic, scannable QR code for the web page you are on (or a link you enter) with QRX, and give you the finished image and its qrx.to short link.
```

### Permission justifications

| Permission                                  | Justification                                                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                 | When the user clicks the QRX toolbar button, the extension reads the current tab's address to prefill it as the QR code's link. It reads nothing else from the page and has no access to any tab until the user clicks. |
| `identity`                                  | Opens the QRX sign-in window with chrome.identity.launchWebAuthFlow so the user can sign in with their QRX account (OAuth with PKCE), and receives the redirect back to the extension.                                  |
| `storage`                                   | Stores the user's QRX sign-in (or API key), the codes they are waiting for, and the style they last picked, locally in the browser, so a code survives the popup closing.                                               |
| `alarms`                                    | While a code is being made (about a minute), an alarm wakes the background worker every 30 seconds so the code finishes and the user is notified even if the browser stopped the worker.                                |
| `notifications`                             | Tells the user when their QR code is ready, or that it could not be made, after they have closed the popup.                                                                                                             |
| Host permission `https://qrx.codes/*`       | The QRX API, which creates and returns the user's codes, and the finished code images, which the extension copies, downloads and shows in the notification.                                                             |
| Host permission `https://clerk.qrx.codes/*` | QRX's sign-in service: the extension exchanges the sign-in code for an access token and refreshes it.                                                                                                                   |

### Remote code

**No, I am not using remote code.** All JavaScript is in the package; the extension only exchanges JSON and images with
the QRX API.

### Data usage (Chrome: "What user data do you plan to collect?")

Tick:

| Category                            | Tick    | What, and why                                                                                                                                                                     |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | No      | The extension doesn't collect names, emails or addresses. Account details stay with QRX's sign-in service.                                                                        |
| Health information                  | No      |                                                                                                                                                                                   |
| Financial and payment information   | No      |                                                                                                                                                                                   |
| **Authentication information**      | **Yes** | The QRX sign-in token (or an API key the user pastes) is kept in the extension's local storage and sent only to QRX to identify the user's account.                               |
| Personal communications             | No      |                                                                                                                                                                                   |
| Location                            | No      |                                                                                                                                                                                   |
| **Web history**                     | **Yes** | The address of the current tab, read only when the user clicks the QRX button and sent to QRX only if they create a code with it, as the code's link.                             |
| User activity                       | No      |                                                                                                                                                                                   |
| Website content                     | No      | The extension never reads page content. (The prompt the user types and the style they pick are sent to QRX to make the code; they are the user's own input, not website content.) |

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Edge asks whether the extension accesses, collects or transmits personal information: **Yes**, with the privacy policy
URL above.

## Distribution

| Field             | Chrome Web Store                                             | Edge Add-ons |
| ----------------- | ------------------------------------------------------------ | ------------ |
| Visibility        | Public                                                       | Public       |
| Regions / markets | All                                                          | All          |
| In-app purchases  | No (the extension sells nothing; QRX plans are on qrx.codes) | n/a          |

## Reviewer notes (Chrome: Test instructions, if shown; Edge: Notes for certification)

```
QRX makes an artistic QR code for the page you are on.

To test:
1. Pin the QRX extension and open any web page (for example https://qrx.codes/developers).
2. Click the QRX button and choose "Sign in to QRX". Sign in with the test account below. Approve access when asked.
3. The popup shows the page's address as the link. Type a picture description (for example "a watercolour lighthouse at dawn"), pick a style, and click "Create QR code".
4. The code takes about a minute. You can close the popup; a notification says when it is ready. Click it (or reopen the popup) to see the image, its qrx.to short link, and Copy link / Copy image / Download PNG.

Test account: username {{REVIEWER_USERNAME}} (email {{REVIEWER_EMAIL}}) / password {{REVIEWER_PASSWORD}}
```

Each store has its own reviewer account, so its usage shows separately: `qrx-chrome-review` (`chrome-review@qrx.codes`)
for Chrome and `qrx-edge-review` (`edge-review@qrx.codes`) for Edge, both with the paid flag. The passwords are in the
team vault ("QRX Chrome reviewer", "QRX Edge reviewer"); never commit them.
