# Sunshine's Boutique ✺

Website + installable app for **Sunshine's Boutique**, Namugongo, Kampala — https://sunshinesboutique.com

- `index.html` – the shop (browse, wishlist, order on WhatsApp, reviews, contact form)
- `account.html` – customer sign-up / sign-in (email or Google), wishlist, rate us
- `studio/` – the owner's phone app: add photos (camera, gallery, or **Share from WhatsApp** on Android), AI writes the listing, publish in one tap
- `supabase/schema.sql` – database, security rules and photo storage
- `supabase/functions/ai-describe` – Gemini AI product writer (secret: `GEMINI_API_KEY`)
- `supabase/functions/contact` – emails new messages via Resend (secret: `RESEND_API_KEY`)

Hosted on GitHub Pages. Settings live in `assets/config.js`.
