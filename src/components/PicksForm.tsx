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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { pickSchema } from "@/schemas/picksSchema";
import { useToast } from "./ui/use-toast";
import { Driver } from "../../types/f1";
import addPicks from "@/actions/addPicks";

type Props = {
    drivers: Driver[];
    leagueId: string;
    season: string;
    round: string;
    pick: string | null;
    keyValue: string,
    label: string;
};

export default function PicksForm({
    drivers,
    leagueId,
    season,
    round,
    pick,
    keyValue,
    label,
}: Props) {

    const defaultValues = {
        driverId: pick ?? "",
    };

    const form = useForm<z.infer<typeof pickSchema>>({
        resolver: zodResolver(pickSchema),
        defaultValues
    });

    const { toast } = useToast();

    async function onSubmit(values: z.infer<typeof pickSchema>) {
        const pick = {
            keyValue: keyValue,
            driverId: values.driverId,
        };
        try {
            await addPicks({
                leagueId: leagueId,
                season: season,
                round: round,
                pick: pick,
            });
        } catch (error: unknown) {
            const message = (error as Error).message;
            toast({
                title: "Uh oh! Something went wrong.",
                variant: "destructive",
                description: message ? message : "Please try again",
            });
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <FormField
                        control={form.control}
                        name="driverId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{label}</FormLabel>
                                <FormControl>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a driver" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {drivers?.map((driver) => (
                                                <SelectItem
                                                    key={driver.driverId}
                                                    value={driver.driverId}
                                                >
                                                    {driver.givenName}{" "}
                                                    {driver.familyName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit">Save</Button>
                </form>
            </Form>
        </div>
    );
}
