import SingleContent from "./SingleContent";

export default function Event({ data }) {
  const { title } = data ?? {};
  const venues =
    data?.eventVenues?.edges
      ?.map((edge) => edge?.node?.name)
      .filter((name) => typeof name === "string" && name.trim() !== "") || [];

  return (
    <SingleContent
      data={data}
      title={title}
      meta={
        venues.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600 my-2">
            <div className="flex items-center">
              <span>{venues.join(", ")}</span>
            </div>
          </div>
        ) : null
      }
    />
  );
}
