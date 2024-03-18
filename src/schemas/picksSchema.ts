import { z } from 'zod';

export const pickSchema = z.object({
  driverNumber: z.string({
    required_error: "Driver is required",
  })
});