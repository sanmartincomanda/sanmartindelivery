# Product purchase action on mobile

## Cause and correction

The purchase footer was nested in the product copy, inside the scrolling sheet.
Its sticky position was constrained by that content and a negative bottom
offset. Long content could put the purchase action below the visible screen.

The public retail product sheet now has three explicit rows: header, a
shrinkable scrolling product body, and a purchase footer outside that body.
Existing dynamic viewport sizing and safe-area padding are retained. Content
rows use max-content to avoid image/copy overlap in WebKit. Quantity input text
is 16px to avoid iOS focus zoom. Prices, quantities and cart handlers are unchanged.

## Regression verification

Open the public preview in an isolated browser, open a weight-based product,
then run Playwright CLI `run-code --filename scripts/qaProductViewport.cjs`.
It checks 390x680, 390x844, 360x560, 430x750, 844x390 and 1280x900, including
resizing back to mobile, scrolling, hit testing the CTA, image/copy separation,
horizontal overflow and selecting/adding 1.5 lb to the anonymous local cart.
It does not submit an order or modify production business data.

WebKit iPhone emulation is not a physical iPhone or Chrome iOS toolbar test.
Short viewports simulate reduced available space; device confirmation remains
useful. No Android/iOS bundle release is part of this web correction.
