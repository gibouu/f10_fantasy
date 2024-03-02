"use client"

import { z } from "zod";
import {supabase} from "@/lib/supabaseClient"

import LeagueForm from "@/components/LeagueForm";

const formSchema = z.object({
  leaguename: z.string().min(4, {
    message: "League name must be at least 4 characters.",
  }),
});

export default function League() {

  const defaultValues = {
    leaguename: "",
  };

  function onSubmitCreate(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  function onSubmitJoin(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <div>
      <div>Leagues</div>
      <LeagueForm onSubmit={onSubmitCreate} formSchema={formSchema} defaultValues={defaultValues} />
    </div>
  );
}
