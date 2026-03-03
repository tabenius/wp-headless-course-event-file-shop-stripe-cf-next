import Link from "next/link";
import Image from "next/image";

export function FeaturedImage({
  post,
  classNames = "h-48 my-9 relative",
  uri = false,
  title = "",
}) {
  const imageNode = post?.featuredImage?.node;
  const imageUrl = imageNode?.sourceUrl;
  if (!imageUrl) {
    return null;
  }

  const imageAlt = imageNode?.altText || post?.title || title || "Featured image";

  return (
    <div className={classNames}>
      {typeof uri === "string" && uri.trim() !== "" ? (
        <Link
          href={uri}
          title={title}
          className="opacity-80 hover:opacity-100 transition-opacity ease-in-out"
        >
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
          />
        </Link>
      ) : (
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
        />
      )}
    </div>
  );
}
