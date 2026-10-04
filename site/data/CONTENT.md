# Reviews and event photos

The home page reviews block and the car-page photo strip stay hidden until these files have real entries. Do not add a name, quote, star rating, or photo that was not on the captured Wix site.

## `reviews.json`

An array. Each item:

```json
{ "name": "Name as shown on the Wix site", "quote": "The review text, copied", "stars": 5, "source": "Where it appeared, for example the home page" }
```

Leave `stars` off when the capture did not show a rating. An item needs both `name` and `quote` or it stays hidden.

## `event-photos.json`

An object keyed by the car's service slug, such as `1953-packard-limo`. Each value is a list of pictures that are clearly from an event, using files already in `site/public/images`:

```json
{ "1953-packard-limo": [{ "src": "/images/example.webp", "alt": "What the photo shows" }] }
```

Studio or catalog shots of the car alone do not belong here.
