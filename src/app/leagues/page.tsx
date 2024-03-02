"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {supabase} from "@/lib/supabaseClient"

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  leaguename: z.string().min(4, {
    message: "League name must be at least 4 characters.",
  }),
});

export default function League() {

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leaguename: "",
    },
  });

  function onSubmitCreate(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  function onSubmitJoin(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <div>
      <div>Leagues</div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmitCreate)}>
          <FormField
            control={form.control}
            name="leaguename"
            render={({ field }) => (
              <FormItem>
                <FormLabel>League Name</FormLabel>
                <FormControl>
                  <Input placeholder="Goat League" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Create</Button>
        </form>
      </Form>
    </div>
  );
}
