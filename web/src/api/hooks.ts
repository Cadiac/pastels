import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColorMetaInput, ColorWithInventory, InventoryInput } from "shared";
import { api } from "./client";

/**
 * Upsert a colour's inventory with an optimistic update applied to every cached
 * catalogue query and the colour's detail query, rolled back on error.
 */
export function useSetInventory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InventoryInput }) =>
      api.setInventory(id, input),

    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ["colors"] });
      const previous = qc.getQueriesData<ColorWithInventory[]>({ queryKey: ["colors"] });
      const previousDetail = qc.getQueryData<ColorWithInventory>(["color", id]);

      const nextInventory =
        input.quantity > 0 ? { quantity: input.quantity, level: input.level } : null;
      const patch = (c: ColorWithInventory): ColorWithInventory =>
        c.id === id ? { ...c, inventory: nextInventory } : c;

      qc.setQueriesData<ColorWithInventory[]>({ queryKey: ["colors"] }, (list) =>
        list?.map(patch),
      );
      if (previousDetail) qc.setQueryData(["color", id], patch(previousDetail));

      return { previous, previousDetail, id };
    },

    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.previousDetail) qc.setQueryData(["color", ctx.id], ctx.previousDetail);
    },

    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ["colors"] });
      qc.invalidateQueries({ queryKey: ["color", id] });
      qc.invalidateQueries({ queryKey: ["history", id] });
    },
  });
}

/** Patch a colour's favourite/want/notes, optimistically, mirroring useSetInventory. */
export function useSetMeta() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ColorMetaInput }) =>
      api.setMeta(id, input),

    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ["colors"] });
      const previous = qc.getQueriesData<ColorWithInventory[]>({ queryKey: ["colors"] });
      const previousDetail = qc.getQueryData<ColorWithInventory>(["color", id]);

      const patch = (c: ColorWithInventory): ColorWithInventory =>
        c.id === id ? { ...c, ...input, notes: input.notes !== undefined ? input.notes : c.notes } : c;

      qc.setQueriesData<ColorWithInventory[]>({ queryKey: ["colors"] }, (list) =>
        list?.map(patch),
      );
      if (previousDetail) qc.setQueryData(["color", id], patch(previousDetail));

      return { previous, previousDetail, id };
    },

    onError: (_err, _vars, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.previousDetail) qc.setQueryData(["color", ctx.id], ctx.previousDetail);
    },

    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ["colors"] });
      qc.invalidateQueries({ queryKey: ["color", id] });
    },
  });
}
