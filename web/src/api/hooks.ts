import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColorWithInventory, InventoryInput } from "shared";
import { api } from "./client";

/**
 * Upsert a colour's inventory with an optimistic update applied to every cached
 * catalogue query and the colour's detail query, rolled back on error.
 */
export function useSetInventory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: InventoryInput }) =>
      api.setInventory(code, input),

    onMutate: async ({ code, input }) => {
      await qc.cancelQueries({ queryKey: ["colors"] });
      const previous = qc.getQueriesData<ColorWithInventory[]>({ queryKey: ["colors"] });
      const previousDetail = qc.getQueryData<ColorWithInventory>(["color", code]);

      const nextInventory =
        input.quantity > 0 ? { quantity: input.quantity, level: input.level } : null;
      const patch = (c: ColorWithInventory): ColorWithInventory =>
        c.code === code ? { ...c, inventory: nextInventory } : c;

      qc.setQueriesData<ColorWithInventory[]>({ queryKey: ["colors"] }, (list) =>
        list?.map(patch),
      );
      if (previousDetail) qc.setQueryData(["color", code], patch(previousDetail));

      return { previous, previousDetail, code };
    },

    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.previousDetail) qc.setQueryData(["color", ctx.code], ctx.previousDetail);
    },

    onSettled: (_data, _err, { code }) => {
      qc.invalidateQueries({ queryKey: ["colors"] });
      qc.invalidateQueries({ queryKey: ["color", code] });
    },
  });
}
