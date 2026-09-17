# Sam Hesketh Creative — website

Static site, no build step. Upload the whole folder to any web host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, cPanel, S3) and point the domain at it. `index.html` is the home page.

## Folder layout

```
index.html                 Landing (nav over the hero, welcome message, contact drawer)
gun-for-hire.html          Motion / Photography panels, feature projects, expedition feature
motion.html                Film portfolio (dark)
photography.html           Photo portfolio with category list
tradecraft.html            Expedition feature, Project Log sign-up, poster wall
project-arctic.html        Client project case study (Arctic / Jalan Jalan)
about.html                 About, kit lists, vehicles, Trusted by, timeline
notebook.html              Wildland Journals index
journal-the-hunt.html      Journal article (blue variant)
journal-ten-years.html     Journal article (green variant)
general-store.html         Ferneaux Outfitters store
product.html               Product detail page
privacy.html / terms.html  Legal
assets/css/fonts.css       @font-face declarations (all fonts self-hosted)
assets/css/site.css        Design system and components
assets/css/pages/*.css     Page-specific styles
assets/js/site.js          Nav, welcome modal, contact drawer, lightbox, filters, forms
assets/fonts/              PP Nikkei Maru, PP Rader, GT Pressura, PP Supply Mono, PP Editorial Old, ED Medimont, Nothing You Could Do
assets/img/brand/          Hobo-sign icons, lockups, stickers, flags, Australia map
assets/img/photos/         Photography (see below)
```

## Photos and quality

Every photograph was cut from the designer's mockups at native resolution (up to 6000 px wide) and saved at JPEG quality 92 with full chroma (no 4:2:0 subsampling), so nothing is soft or blocky. For each master there are responsive copies (`-w1280`, `-w2000`, `-w2880`, quality 86) and the pages use `srcset`, so phones download a small file and large or retina screens get the full-resolution master. To swap a photo, replace the master and its `-wNNNN` copies with the same names, or drop the `-w` files and delete the `srcset` attribute for that image.

The hero plates had the mockup type baked into the pixels; that type was removed with an inpainting model so the headlines are live, editable HTML text.

`assets/img/photos/manifest.json` lists every image with its size, description and which mockup it came from.

## Things to fill in before launch

- Films: on `motion.html` (and any `data-video=""` attribute) paste a YouTube or Vimeo URL into `data-video`. The lightbox embeds it automatically.
- Forms: the contact drawer and the Project Log sign-up post to `https://formsubmit.co/info@samuelhesketh.com`. The first submission triggers a one-time activation email from FormSubmit to that inbox. To use another service (Netlify Forms, Basin, your own endpoint) change the form `action`.
- Social links in the footer (Instagram, YouTube, LinkedIn) currently point at the platform home pages.
- Store: product pages link to the contact drawer instead of a cart. Connect Shopify Buy Buttons, Snipcart or similar when the shop goes live.
- The welcome message opens once per browser session on the home page (`data-auto` on `#welcome` in `index.html`). Remove that attribute to disable it.

## Fonts

All brand fonts are self-hosted from the brand kit. The handwritten quotes use Nothing You Could Do (Open Font License) as a stand-in for August July, which was not in the kit; if you own August July, add its woff2 to `assets/fonts/` and update the last `@font-face` in `fonts.css`.

## Hosting notes

- Serve with gzip/brotli and long cache headers for `/assets/` (fonts and photos never change names unless you replace them).
- The site is plain HTML, so `https://yourdomain.com/about.html` style URLs are the defaults. Most hosts can drop the `.html` (Netlify "pretty URLs", Cloudflare Pages does it automatically).
- No cookies, no analytics, no third-party scripts are loaded.
