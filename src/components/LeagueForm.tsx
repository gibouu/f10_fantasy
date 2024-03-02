import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z, ZodSchema } from "zod";

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

interface DefaultValues {
  leaguename: string;
  // Add other properties as needed, for example:
  // teamCount?: number; // Optional property
  // isActive?: boolean; // Optional property
  // You can add as many properties as needed to match the shape of your object
}

type Props = {
  formSchema: ZodSchema;
  onSubmit: (values: any) => void;
  defaultValues: DefaultValues;
};

const LeagueForm = ({onSubmit, formSchema, defaultValues}: Props) => {

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues
  });

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
                  <Input placeholder="Goat League" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Create</Button>
        </form>
      </Form>
  )
}

export default LeagueForm