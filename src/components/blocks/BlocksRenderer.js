import Image from "next/image";

function parseAttributes(attributesJSON) {
  if (typeof attributesJSON !== "string" || attributesJSON.trim() === "") {
    return {};
  }

  try {
    const parsed = JSON.parse(attributesJSON);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDimension(value, fallback) {
  return typeof value === "number" && value > 0 ? value : fallback;
}

function extractImageData(attrs = {}) {
  const imageUrlCandidates = [
    attrs.url,
    attrs.src,
    attrs.sourceUrl,
    attrs.fullUrl,
    attrs.largeUrl,
    attrs.mediumUrl,
  ];
  const imageUrl = imageUrlCandidates.find(
    (value) => typeof value === "string" && value.trim() !== "",
  );

  if (!imageUrl) {
    return null;
  }

  return {
    url: imageUrl,
    alt: typeof attrs.alt === "string" ? attrs.alt : "",
    caption: typeof attrs.caption === "string" ? attrs.caption : "",
    width: normalizeDimension(attrs.width, 1200),
    height: normalizeDimension(attrs.height, 675),
  };
}

function renderSingleBlock(block, key) {
  if (!block || typeof block !== "object") {
    return null;
  }

  const blockName = typeof block.name === "string" ? block.name : "";
  const attrs = parseAttributes(block.attributesJSON);
  const nestedBlocks = Array.isArray(block.innerBlocks) ? block.innerBlocks : [];

  if (blockName === "core/image") {
    const imageData = extractImageData(attrs);
    if (!imageData) {
      return null;
    }

    return (
      <figure key={key} className="my-8">
        <Image
          src={imageData.url}
          alt={imageData.alt}
          width={imageData.width}
          height={imageData.height}
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="w-full h-auto rounded"
        />
        {imageData.caption.trim() !== "" ? (
          <figcaption
            className="mt-2 text-sm text-gray-600"
            dangerouslySetInnerHTML={{ __html: imageData.caption }}
          />
        ) : null}
      </figure>
    );
  }

  if (blockName === "core/gallery") {
    const galleryImages = Array.isArray(attrs.images)
      ? attrs.images
          .map((image) => extractImageData(image))
          .filter((image) => image !== null)
      : [];

    if (galleryImages.length > 0) {
      return (
        <section key={key} className="my-8 grid gap-4 sm:grid-cols-2">
          {galleryImages.map((image, imageIndex) => (
            <figure key={`${key}-gallery-${imageIndex}`} className="space-y-2">
              <Image
                src={image.url}
                alt={image.alt}
                width={image.width}
                height={image.height}
                sizes="(max-width: 640px) 100vw, 50vw"
                className="w-full h-auto rounded"
              />
              {image.caption.trim() !== "" ? (
                <figcaption
                  className="text-sm text-gray-600"
                  dangerouslySetInnerHTML={{ __html: image.caption }}
                />
              ) : null}
            </figure>
          ))}
        </section>
      );
    }

    if (nestedBlocks.length > 0) {
      return (
        <section key={key} className="my-8">
          {nestedBlocks.map((innerBlock, index) =>
            renderSingleBlock(innerBlock, `${key}-gallery-inner-${index}`),
          )}
        </section>
      );
    }
  }

  if (blockName === "core/cover") {
    const coverImage = extractImageData(attrs);
    if (!coverImage) {
      return null;
    }

    const minHeight = normalizeDimension(attrs.minHeight, 360);

    return (
      <section
        key={key}
        className="my-8 relative overflow-hidden rounded"
        style={{ minHeight: `${minHeight}px` }}
      >
        <Image
          src={coverImage.url}
          alt={coverImage.alt}
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 p-8 text-white">
          {nestedBlocks.length > 0 ? (
            nestedBlocks.map((innerBlock, index) =>
              renderSingleBlock(innerBlock, `${key}-cover-inner-${index}`),
            )
          ) : typeof block.renderedHtml === "string" &&
            block.renderedHtml.trim() !== "" ? (
            <div dangerouslySetInnerHTML={{ __html: block.renderedHtml }} />
          ) : null}
        </div>
      </section>
    );
  }

  if (typeof block.renderedHtml === "string" && block.renderedHtml.trim() !== "") {
    return (
      <div
        key={key}
        dangerouslySetInnerHTML={{ __html: block.renderedHtml }}
      />
    );
  }

  if (nestedBlocks.length > 0) {
    return (
      <div key={key}>
        {nestedBlocks.map((innerBlock, index) =>
          renderSingleBlock(innerBlock, `${key}-inner-${index}`),
        )}
      </div>
    );
  }

  return null;
}

export default function BlocksRenderer({ blocks }) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  if (safeBlocks.length === 0) {
    return null;
  }

  return (
    <>
      {safeBlocks.map((block, index) => renderSingleBlock(block, `block-${index}`))}
    </>
  );
}
