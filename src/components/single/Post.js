import { formatDate } from "@/lib/utils";
import SingleContent from "./SingleContent";

export default function Post({ data }) {
  const { title, author, content, date, editorBlocks } = data ?? {};

  return (
    <SingleContent
      data={{ ...data, content, editorBlocks }}
      title={title}
      meta={
        <p className=" text-gray-600">
          {"by "}
          <span className="text-orange-600" itemProp="name">
            {author?.node?.name}
          </span>
          {" on "}
          <time dateTime={date} className=" text-gray-600">
            {formatDate(date)}
          </time>
        </p>
      }
    />
  );
}
