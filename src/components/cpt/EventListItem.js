import Link from "next/link";
import { FeaturedImage } from "../image/FeaturedImage";
import { createExcerpt } from "@/lib/utils";
import { decodeEntities } from "@/lib/decodeEntities";
import { formatEventDateRange } from "@/lib/eventDates";

export default function EventListItem({ post }) {
  if (!post) return null;
  const { content, title, uri } = post;
  const dateLabel = formatEventDateRange(post);

  const venues =
    (post.eventVenues || post.location)?.edges
      ?.map((edge) => edge?.node?.name)
      .filter((name) => typeof name === "string" && name.trim() !== "") || [];

  return (
    <article className="container max-w-4xl px-10 py-6 mx-auto rounded-lg shadow-sm bg-gray-50 mb-4">
      <h2 className="mt-3">
        <Link
          href={uri || "#"}
          title={title || ""}
          className="text-2xl font-bold hover:underline"
        >
          {decodeEntities(title || "Untitled")}
        </Link>
      </h2>

      {venues.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 my-2">
          <div className="flex items-center">
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              ></path>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              ></path>
            </svg>
            <span>{venues.join(", ")}</span>
          </div>
        </div>
      )}

      {dateLabel && (
        <div className="text-sm text-gray-600 mb-2" aria-label="Event date">
          {dateLabel}
        </div>
      )}

      <FeaturedImage
        post={post}
        uri={uri}
        title={title}
        classNames="h-48 my-6 relative"
      />

      <div className="mt-2 mb-4">
        <p>{decodeEntities(createExcerpt(content))}</p>
      </div>

      <Link
        href={uri}
        title="Läs mer"
        className="hover:underline text-orange-600 mt-4"
      >
        Läs mer
      </Link>
    </article>
  );
}
