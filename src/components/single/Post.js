"use client";

import { formatDate } from "@/lib/utils";
import Comments from "../comment/Comments";
import CommentForm from "../comment/CommentForm";
import { useState } from "react";
import { fetchGraphQL } from "@/lib/client";
import SingleContent from "./SingleContent";

const AddCommentToPostMutation = `
mutation AddCommentToPostQuery($author: String!, $authorEmail: String!, $commentOn: Int!, $content: String! = "") {
  createComment(input: { author: $author, authorEmail: $authorEmail, commentOn: $commentOn, content: $content }) {
    success
  }
}`;

export default function Post({ data }) {
  const { title, author, content, date, comments, databaseId, editorBlocks } =
    data ?? {};
  const commentsList = comments?.edges;

  const [commentStatus, setCommentStatus] = useState({
    loading: false,
    error: null,
    success: false,
  });

  const addComment = async (inputs) => {
    setCommentStatus({ loading: true, error: null, success: false });

    try {
      const result = await fetchGraphQL(AddCommentToPostMutation, {
        ...inputs,
        commentOn: databaseId,
      });

      if (result.errors) {
        throw new Error(
          result.errors[0]?.message || "Error submitting comment",
        );
      }

      setCommentStatus({
        loading: false,
        error: null,
        success: result?.createComment?.success,
      });
    } catch (error) {
      setCommentStatus({
        loading: false,
        error: error.message,
        success: false,
      });
    }
  };

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
      footer={
        <>
          <Comments comments={commentsList} />
          <CommentForm
            onSubmit={addComment}
            isLoading={commentStatus.loading}
            errorMessage={commentStatus.error}
            isSuccessful={commentStatus.success}
          />
        </>
      }
    />
  );
}
