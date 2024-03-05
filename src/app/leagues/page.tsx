import LeagueForm from "@/components/LeagueForm";

export default function League() {

  const defaultValues = {
    leaguename: "",
  };

  return (
    <div>
      <div>Leagues</div>
      <LeagueForm
        defaultValues={defaultValues} />
    </div>
  );
}

/*

try {
      const { supabase, session } = await getSupabaseClient();
      if (!session) throw new Error("Session not found. Please log in.");

      const { data: league, error: errorCreateLeague } = await supabase
        .from("league")
        .insert([{ name: values.leaguename }])
        .select();

      if (errorCreateLeague) throw errorCreateLeague;

      const email = session.user?.email;

      // Check if the email exists and is a string; if not, throw an error.
      if (typeof email !== "string") {
        throw new Error(
          "Email is not available. Please ensure you are logged in and have an email address."
        );
      }

      // If the email is available and confirmed to be a string, proceed with the database operation.
      const { data: user, error: userFetchError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .select();

      // Proceed with your logic, for example, handling errors or working with the fetched data.
      if (userFetchError) {
        console.error("Error fetching user data:", userFetchError.message);
        // Optionally, throw an error or handle it as needed
        throw userFetchError;
      }

      const { error: joinLeagueError } = await supabase
        .from("user_league")
        .insert([{ user_id: user[0].id, league_id: league[0].id }]);

      if (joinLeagueError) throw joinLeagueError;

      // Handle success (e.g., show success message or redirect)
      router.push('/'); // Navigate to home page
    } catch (error) {
      const message = (error as Error).message;
      console.error(message);
      toast({
        title: "Uh oh! Something went wrong.",
        variant: "destructive",
        description: message,
      });
    }

*/
