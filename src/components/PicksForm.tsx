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
import { useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
    drivers: Driver[];
    leagueId: string;
    round: string;
    meetingKey: string | null;
    pick: string | null;
    keyValue: string;
    label: string;
};

export default function PicksForm({
    drivers,
    leagueId,
    round,
    meetingKey,
    pick,
    keyValue,
    label,
}: Props) {
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const defaultValues = {
        driverNumber: pick ?? "",
    };

    const form = useForm<z.infer<typeof pickSchema>>({
        resolver: zodResolver(pickSchema),
        defaultValues,
    });

    const { toast } = useToast();

    async function onSubmit(values: z.infer<typeof pickSchema>) {
        setIsSubmitting(true);
        const pick = {
            keyValue: keyValue,
            driverNumber: values.driverNumber,
        };
        try {
            await addPicks({
                leagueId: leagueId,
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
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <FormField
                        control={form.control}
                        name="driverNumber"
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
                                        <SelectContent
                                            ref={(ref) => {
                                                if (!ref) return;
                                                ref.ontouchstart = (e) => {
                                                    e.preventDefault();
                                                };
                                            }}
                                        >
                                            {drivers?.map((driver) =>
                                                meetingKey ? (
                                                    <SelectItem
                                                        key={
                                                            driver.driver_number
                                                        }
                                                        value={
                                                            driver.driver_number
                                                        }
                                                    >
                                                        {driver.first_name}{" "}
                                                        {driver.last_name}
                                                    </SelectItem>
                                                ) : (
                                                    <SelectItem
                                                        key={
                                                            driver.permanentNumber
                                                        }
                                                        value={
                                                            driver.permanentNumber
                                                        }
                                                    >
                                                        {driver.givenName}{" "}
                                                        {driver.familyName}
                                                    </SelectItem>
                                                )
                                            )}
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <div className="flex gap-2">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <div>Saving...</div>
                            </div>
                        ) : (
                            "Save"
                        )}
                    </Button>
                </form>
            </Form>
        </div>
    );
}
