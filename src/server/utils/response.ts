import { Context } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";

export type SuccessResponse<T> = {
  status: "success";
  data: T;
};

export type ErrorResponse = {
  status: "error";
  error: {
    code: string;
    message: string;
  };
};

export type PaginatedResponse<T> = SuccessResponse<{
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}>;

export const successResponse = <T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200
) => {
  return c.json<SuccessResponse<T>>(
    {
      status: "success",
      data,
    },
    status
  );
};

export const errorResponse = (
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 500
) => {
  return c.json<ErrorResponse>(
    {
      status: "error",
      error: {
        code,
        message,
      },
    },
    status
  );
};

export const paginatedResponse = <T>(
  c: Context,
  items: T[],
  total: number,
  page: number,
  limit: number,
  status: ContentfulStatusCode = 200
) => {
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;

  return c.json<PaginatedResponse<T>>(
    {
      status: "success",
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore,
        },
      },
    },
    status
  );
};

// Error codes constants
export const ErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DUPLICATE_ERROR: "DUPLICATE_ERROR",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  TEST_ALREADY_SUBMITTED: "TEST_ALREADY_SUBMITTED",
} as const;
