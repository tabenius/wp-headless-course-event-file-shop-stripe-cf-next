import SingleContent from "./SingleContent";

export default function Product({ data, footer = null }) {
  return (
    <SingleContent
      data={data}
      meta={
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          Product
        </p>
      }
      footer={footer}
    />
  );
}
