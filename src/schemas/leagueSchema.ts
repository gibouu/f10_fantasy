import { z } from 'zod';

export const formSchema = z.object({
  leaguename: z.string().min(4, {
    message: "League name must be at least 4 characters.",
  }),
});