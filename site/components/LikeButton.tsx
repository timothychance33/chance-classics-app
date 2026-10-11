"use client";

import { useState } from "react";

export function LikeButton() {
  const [liked, setLiked] = useState(false);
  return (
    <button className="heart" type="button" aria-pressed={liked} aria-label={liked ? "Post liked" : "Post not marked as liked"} onClick={() => setLiked((v) => !v)}>
      {liked ? "♥" : "♡"}
    </button>
  );
}
