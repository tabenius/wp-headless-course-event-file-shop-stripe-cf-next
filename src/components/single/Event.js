import SingleContent from "./SingleContent";
import { formatEventDateRange } from "@/lib/eventDates";

export default function Event({ data }) {
  const { title } = data ?? {};
  const dateLabel = formatEventDateRange(data);
  const venues =
    data?.eventVenues?.edges
      ?.map((edge) => edge?.node?.name)
      .filter((name) => typeof name === "string" && name.trim() !== "") || [];

  const metaParts = [];
  if (dateLabel) {
    metaParts.push(
      <div key="date" className="flex items-center">
        <span>{dateLabel}</span>
      </div>,
    );
  }
  if (venues.length > 0) {
    metaParts.push(
      <div key="venue" className="flex items-center">
        <span>{venues.join(", ")}</span>
      </div>,
    );
  }

  return (
    <SingleContent
      data={data}
      title={title}
      meta={
        metaParts.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600 my-2">
            {metaParts}
          </div>
        ) : null
      }
    />
  );
}
