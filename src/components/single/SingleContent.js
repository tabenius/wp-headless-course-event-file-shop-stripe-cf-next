import { FeaturedImage } from "@/components/image/FeaturedImage";
import BlocksRenderer from "@/components/blocks/BlocksRenderer";
import { transformContent } from "@/lib/transformContent";
import { decodeEntities } from "@/lib/decodeEntities";

export default function SingleContent({
  data,
  title,
  meta = null,
  footer = null,
  featuredImageClassNames = "h-48 my-9 relative opacity-80 hover:opacity-100 transition-opacity ease-in-out",
}) {
  const safeData = data && typeof data === "object" ? data : {};
  const resolvedTitle =
    typeof title === "string" && title.trim() !== ""
      ? decodeEntities(title)
      : typeof safeData.title === "string"
        ? decodeEntities(safeData.title)
        : "";
  const content =
    typeof safeData.content === "string" ? transformContent(decodeEntities(safeData.content)) : "";
  const editorBlocks = Array.isArray(safeData.editorBlocks)
    ? safeData.editorBlocks
    : [];
  const hasBlocks = editorBlocks.length > 0;

  return (
    <article className="max-w-2xl px-6 py-24 mx-auto space-y-12">
      <div className="w-full mx-auto space-y-4 text-center">
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">
          {resolvedTitle}
        </h1>
        {meta}
        <FeaturedImage
          post={safeData}
          title={resolvedTitle}
          classNames={featuredImageClassNames}
        />
      </div>
      <div className="text-gray-800 prose prose-p:my-4 max-w-none wp-content text-xl">
        {hasBlocks ? (
          <BlocksRenderer blocks={editorBlocks} />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        )}
      </div>
      {footer}
    </article>
  );
}
