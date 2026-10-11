import Link from "next/link";
import { LikeButton } from "@/components/LikeButton";
import { pageMeta, posts } from "@/lib/content";

export const metadata = pageMeta({
  title: "Blog | Chance Classics, Classic Car Rental",
  description: "Notes on booking a classic car for a Louisiana wedding, from Chance Classics in Benton.",
  path: "/blog",
});

export default function BlogPage() {
  return (
    <article className="wrap page">
      <h1 className="center">All Posts</h1>
      <div className="posts">
        {posts.map((post) => (
          <article key={post.slug}>
            <Link className="post-card" href={`/post/${post.slug}/`}>
              <h2>{post.title}</h2>
            </Link>
            <div className="byline">
              <span className="avatar" aria-hidden="true">T</span>
              <div>
                <div>Timothy Chance</div>
                <div className="meta">{post.date} · {post.read}</div>
                <div className="meta">{post.views} · 0 comments</div>
              </div>
              <LikeButton />
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}
