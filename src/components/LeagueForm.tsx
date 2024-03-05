"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import createLeague from "@/actions/createLeague";
import { formSchema } from "@/schemas/leagueSchema";
import { useToast } from "./ui/use-toast";
import joinLeague from "@/actions/joinLeague";
import getSupabaseClient from "@/db/supabaseClient";

interface DefaultValues {
  leaguename: string;
  // Add other properties as needed, for example:
  // teamCount?: number; // Optional property
  // isActive?: boolean; // Optional property
  // You can add as many properties as needed to match the shape of your object
}

type Props = {
  defaultValues: DefaultValues;
};

const LeagueForm = ({ defaultValues }: Props) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues,
  });

  const { toast } = useToast();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const leagueName = values.leaguename;

    const { supabase } = await getSupabaseClient();

    const { data: league, error: errorCreateLeague } = await supabase
    .from("leagues")
    .insert([{ name: leagueName }])
    .select();

    try {
      const leagueId = await createLeague(leagueName);

      await joinLeague(leagueId);
    } catch (error: unknown) {
      const message = (error as Error).message;
      toast({
        title: "Uh oh! Something went wrong.",
        variant: "destructive",
        description: message ? message : "please try again",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="leaguename"
          render={({ field }) => (
            <FormItem>
              <FormLabel>League Name</FormLabel>
              <FormControl>
                <Input type={"text"} placeholder="Goat League" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Create</Button>
      </form>
    </Form>
  );
};

export default LeagueForm;
