import { z } from 'zod';

export const pickSchema = z.object({
  driverId: z.string({
    required_error: "Driver is required",
  })
});