# Reviews and event photos

Do not invent or paraphrase a review. Copy the reviewer’s name, star rating, and text exactly, including typos and emoji. Leave relative dates out of this file; they go stale and the site does not show them.

## `reviews.json`

```json
{
  "listing_name": "Chance Classics",
  "maps_url": "https://www.google.com/maps/place/...",
  "overall_rating": 5.0,
  "review_count": 10,
  "captured_at": "YYYY-MM-DD",
  "reviews": [
    { "name": "Name as on Google", "stars": 5, "text": "Exact review text" }
  ]
}
```

The home page links `overall_rating` and `review_count` to `maps_url`. A review with an empty `text` counts toward the badge and is not shown as a quote.

Home order leads with Ayden McDermott, Megan Acosta, J Williams, Susan, and Rodrick Carter, then the other written reviews in file order. Long quotes are clamped, with Read more.

A car page shows a review only when the review’s own words name that car: Carmen, Brenda, Phyllis, or Chevelle / Sylvia. The wedding page shows the first two written reviews, in that home order, whose text contains “wedding”.

## `event-photos.json`

An object keyed by the car's service slug, such as `1953-packard-limo`. Each value is a list of pictures that are clearly from an event, using files already in `site/public/images`:

```json
{ "1953-packard-limo": [{ "src": "/images/example.webp", "alt": "What the photo shows" }] }
```

Studio or catalog shots of the car alone do not belong here. An empty list stays hidden.
