import Link from "next/link";
import { notFound } from "next/navigation";
import { LikeButton } from "@/components/LikeButton";
import { pageMeta, postBySlug, posts } from "@/lib/content";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const post = postBySlug(slug);
    if (!post) return {};
    return pageMeta({
      title: post.title,
      description: post.description,
      path: `/post/${post.slug}`,
    });
  });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();
  return (
    <article className="wrap page article">
      <p><Link className="back" href="/blog/">All Posts</Link></p>
      <h1>{post.title}</h1>
      <div className="byline">
        <span className="avatar" aria-hidden="true">T</span>
        <div>
          <div>Timothy Chance</div>
          <div className="meta"><time dateTime={post.dateIso}>{post.date}</time> · {post.read}</div>
          <div className="meta">{post.views} · 0 comments</div>
        </div>
        <LikeButton />
      </div>
      {post.blocks.map((block, i) => {
        if (block.type === "h3") return <h3 key={i}>{block.text}</h3>;
        if (block.type === "ul") {
          return (
            <ul key={i}>
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          );
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: block.html }} />;
      })}
      <h2>Comments</h2>
      <p className="meta">Comments are closed on this copy of the site.</p>
    </article>
  );
}
