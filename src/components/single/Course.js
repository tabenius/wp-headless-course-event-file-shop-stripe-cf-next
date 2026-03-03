import SingleContent from "./SingleContent";

export default function Course({ data }) {
  return (
    <SingleContent
      data={data}
      meta={
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          Kurs
        </p>
      }
    />
  );
}
