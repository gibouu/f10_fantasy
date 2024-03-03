"use client";

import { z } from "zod";

import LeagueForm from "@/components/LeagueForm";
import getSupabaseClient from "@/lib/supabaseClient";

const formSchema = z.object({
    leaguename: z.string().min(4, {
        message: "League name must be at least 4 characters.",
    }),
});

export default function League() {
    const defaultValues = {
        leaguename: "",
    };

    async function onSubmitCreate(values: z.infer<typeof formSchema>) {
        console.log(values);

        const supabase  = await getSupabaseClient();

        const { data, error } = await supabase
            .from("league")
            .insert([{name: values.leaguename}])
            .select();

        if (error) {
            console.log(error);
        } else {
            console.log(data);
        }
    }

    function onSubmitJoin(values: z.infer<typeof formSchema>) {
        console.log(values);
    }

    return (
        <div>
            <div>Leagues</div>
            <LeagueForm
                onSubmit={onSubmitCreate}
                formSchema={formSchema}
                defaultValues={defaultValues}
            />
        </div>
    );
}
