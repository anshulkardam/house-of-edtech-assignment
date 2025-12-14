import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/rpc";
import { InferRequestType, InferResponseType } from "hono";

type RequestType = InferRequestType<
  (typeof client.api.v1.auth.register)["$post"]
>;
type ResponseType = InferResponseType<
  (typeof client.api.v1.auth.register)["$post"]
>;

export const useRegister = () => {
  console.log("reaching here?");
  const mutation = useMutation<ResponseType, Error, RequestType>({
    mutationFn: async ({ json }) => {
      const response = await client.api.v1.auth.register["$post"]({ json });
      return await response.json();
    },
  });

  return mutation;
};
