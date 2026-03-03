import { formatDate } from "@/lib/utils";
import SingleContent from "./SingleContent";

export default function Event({ data }) {
  const { title, eventFields } = data ?? {};
  const { date, startTime, endTime } = eventFields ?? {};
  const locations =
    data?.location?.edges
      ?.map((edge) => edge?.node?.name)
      .filter((name) => typeof name === "string" && name.trim() !== "") || [];

  return (
    <SingleContent
      data={data}
      title={title}
      meta={
        <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600 my-2">
          {date ? (
            <div className="flex items-center">
              <time dateTime={date}>{formatDate(date)}</time>
            </div>
          ) : null}
          {startTime ? (
            <div className="flex items-center">
              <span>
                {startTime}
                {endTime ? ` - ${endTime}` : ""}
              </span>
            </div>
          ) : null}
          {locations.length > 0 ? (
            <div className="flex items-center">
              <span>{locations.join(", ")}</span>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
